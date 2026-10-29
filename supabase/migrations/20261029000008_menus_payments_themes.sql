-- =============================================================================
-- 1 TAP SOLUTION — menus, payments, Google reviews, page styles and expiry
--   * QR types and page items: menu, payment (UPI and links), review.
--   * Page style ("theme") on every page-type code: font, colours, background
--     (colour, gradient, picture), button style.
--   * qr_codes.expires_at: a code stops working after this moment until it is
--     renewed (for clients on a paid plan).
-- Safe to run on a database that already has migrations 0001–0007.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Expiry
-- ---------------------------------------------------------------------------
alter table public.qr_codes add column if not exists expires_at timestamptz;
create index if not exists qr_codes_expires_idx on public.qr_codes (expires_at) where expires_at is not null;
comment on column public.qr_codes.expires_at is
  'When set and in the past, scans show "not active" until an administrator renews the code.';

-- ---------------------------------------------------------------------------
-- 2. Validation helpers
-- ---------------------------------------------------------------------------
-- Never NULL, so a missing value can never slip through a CHECK constraint.
create or replace function public.is_uuid_text(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', false)
$$;

create or replace function public.is_valid_theme(t jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  if t is null then
    return true;
  end if;
  if jsonb_typeof(t) <> 'object' or char_length(t::text) > 3000 then
    return false;
  end if;
  foreach k in array array['accent', 'title_color', 'text_color', 'bg_color', 'bg_color2', 'button_color', 'button_text_color'] loop
    if t ? k and not public.is_hex_color(t ->> k) then
      return false;
    end if;
  end loop;
  return coalesce(t ->> 'font', 'inter') in
           ('inter', 'poppins', 'montserrat', 'playfair', 'lora', 'nunito', 'merriweather', 'oswald', 'dancing', 'roboto-slab')
     and coalesce(t ->> 'bg_type', 'soft') in ('soft', 'solid', 'gradient', 'image')
     and (case when t -> 'bg_angle' is null then true
               when jsonb_typeof(t -> 'bg_angle') <> 'number' then false
               else (t ->> 'bg_angle')::numeric between 0 and 360 end)
     and (case when t -> 'bg_overlay' is null then true
               when jsonb_typeof(t -> 'bg_overlay') <> 'number' then false
               else (t ->> 'bg_overlay')::numeric between 0 and 0.9 end)
     and (t ->> 'bg_image_file_id' is null or public.is_uuid_text(t ->> 'bg_image_file_id'))
     and coalesce(t ->> 'button_style', 'solid') in ('solid', 'outline', 'soft')
     and coalesce(t ->> 'button_shape', 'rounded') in ('rounded', 'pill', 'square');
end;
$$;

-- UPI payments, payment links and bank details.
create or replace function public.is_valid_payment(d jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  l jsonb;
  has_upi boolean := coalesce(d ->> 'upi_id', '') <> '';
  has_links boolean := coalesce(jsonb_typeof(d -> 'links') = 'array' and jsonb_array_length(d -> 'links') > 0, false);
  has_bank boolean := coalesce(d #>> '{bank,account_number}', '') <> '';
begin
  if not (has_upi or has_links or has_bank) then
    return false;
  end if;
  if has_upi and (d ->> 'upi_id') !~ '^[A-Za-z0-9._-]{2,200}@[A-Za-z][A-Za-z0-9]{1,63}$' then
    return false;
  end if;
  if char_length(coalesce(d ->> 'payee_name', '')) > 100
     or char_length(coalesce(d ->> 'note', '')) > 80
     or char_length(coalesce(d ->> 'label', '')) > 80
     or (case when d -> 'amount' is null then false
              when jsonb_typeof(d -> 'amount') <> 'number' then true
              else (d ->> 'amount')::numeric <= 0 or (d ->> 'amount')::numeric > 1000000 end)
     or (d -> 'direct' is not null and jsonb_typeof(d -> 'direct') <> 'boolean') then
    return false;
  end if;
  if d -> 'links' is not null then
    if jsonb_typeof(d -> 'links') <> 'array' or jsonb_array_length(d -> 'links') > 6 then
      return false;
    end if;
    for l in select * from jsonb_array_elements(d -> 'links') loop
      if jsonb_typeof(l) <> 'object' or char_length(coalesce(l ->> 'label', '')) not between 1 and 60
         or not public.is_safe_http_url(l ->> 'url') then
        return false;
      end if;
    end loop;
  end if;
  if d -> 'bank' is not null then
    if jsonb_typeof(d -> 'bank') <> 'object'
       or char_length(coalesce(d #>> '{bank,account_name}', '')) > 100
       or char_length(coalesce(d #>> '{bank,bank_name}', '')) > 100
       or coalesce(d #>> '{bank,account_number}', '') !~ '^[0-9]{0,34}$'
       or (coalesce(d #>> '{bank,ifsc}', '') <> '' and (d #>> '{bank,ifsc}') !~ '^[A-Z]{4}0[A-Z0-9]{6}$') then
      return false;
    end if;
  end if;
  return true;
end;
$$;

-- Google review: a review link or a Google Place ID.
create or replace function public.is_valid_review(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (public.is_safe_http_url(d ->> 'url') or coalesce(d ->> 'place_id', '') ~ '^[A-Za-z0-9_-]{10,200}$')
     and char_length(coalesce(d ->> 'label', '')) <= 80
     and char_length(coalesce(d ->> 'title', '')) <= 120
$$;

-- Menu as a PDF, photos, a link, or typed sections with items and prices.
create or replace function public.is_valid_menu(d jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  s jsonb;
  i jsonb;
begin
  if char_length(d::text) > 80000
     or char_length(coalesce(d ->> 'title', '')) > 120
     or char_length(coalesce(d ->> 'note', '')) > 300
     or char_length(coalesce(d ->> 'currency', '')) > 8 then
    return false;
  end if;
  case coalesce(d ->> 'mode', '')
    when 'pdf' then
      return public.is_uuid_text(d ->> 'file_id');
    when 'images' then
      return jsonb_typeof(d -> 'file_ids') = 'array' and jsonb_array_length(d -> 'file_ids') between 1 and 30;
    when 'link' then
      return public.is_safe_http_url(d ->> 'url');
    when 'items' then
      if jsonb_typeof(d -> 'sections') <> 'array' or jsonb_array_length(d -> 'sections') not between 1 and 40 then
        return false;
      end if;
      for s in select * from jsonb_array_elements(d -> 'sections') loop
        if jsonb_typeof(s) <> 'object' or char_length(coalesce(s ->> 'name', '')) > 80
           or jsonb_typeof(s -> 'items') <> 'array' or jsonb_array_length(s -> 'items') > 150 then
          return false;
        end if;
        for i in select * from jsonb_array_elements(s -> 'items') loop
          if jsonb_typeof(i) <> 'object'
             or char_length(coalesce(i ->> 'name', '')) not between 1 and 120
             or char_length(coalesce(i ->> 'price', '')) > 30
             or char_length(coalesce(i ->> 'description', '')) > 300
             or coalesce(i ->> 'tag', '') not in ('', 'veg', 'non_veg', 'vegan', 'spicy', 'new', 'popular') then
            return false;
          end if;
        end loop;
      end loop;
      return true;
    else
      return false;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Types, destinations and items
-- ---------------------------------------------------------------------------
alter table public.qr_codes drop constraint if exists qr_codes_type_check;
alter table public.qr_codes add constraint qr_codes_type_check check (type in
  ('business_profile', 'document', 'website', 'phone', 'whatsapp', 'email',
   'maps', 'social', 'wifi', 'contact_card', 'custom_link', 'landing_page', 'text',
   'menu', 'payment', 'review'));

create or replace function public.is_valid_qr_destination(p_type text, d jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return false;
  end if;
  -- Any page can carry a style.
  if d ? 'theme' and not public.is_valid_theme(d -> 'theme') then
    return false;
  end if;

  case p_type
    when 'business_profile' then
      return true;
    when 'landing_page' then
      return char_length(coalesce(d ->> 'title', '')) <= 160
         and char_length(coalesce(d ->> 'subtitle', '')) <= 300
         and (d ->> 'accent' is null or public.is_hex_color(d ->> 'accent'))
         and (d ->> 'avatar_file_id' is null or public.is_uuid_text(d ->> 'avatar_file_id'))
         and (d ->> 'cover_file_id' is null or public.is_uuid_text(d ->> 'cover_file_id'))
         and (d -> 'show_business' is null or jsonb_typeof(d -> 'show_business') = 'boolean');
    when 'text' then
      return char_length(btrim(coalesce(d ->> 'text', ''))) between 1 and 4000
         and char_length(coalesce(d ->> 'title', '')) <= 160;
    when 'menu' then
      return public.is_valid_menu(d);
    when 'payment' then
      return public.is_valid_payment(d);
    when 'review' then
      return public.is_valid_review(d);
    when 'document' then
      return coalesce(d ->> 'open_mode', 'page') in ('page', 'direct');
    when 'website', 'custom_link' then
      return public.is_safe_http_url(d ->> 'url');
    when 'social' then
      return public.is_safe_http_url(d ->> 'url')
         and coalesce(d ->> 'platform', 'other') in
             ('instagram', 'facebook', 'youtube', 'linkedin', 'x', 'tiktok',
              'pinterest', 'threads', 'telegram', 'google_business', 'other');
    when 'phone' then
      return public.is_valid_phone(d ->> 'phone');
    when 'whatsapp' then
      return public.is_valid_phone(d ->> 'phone')
         and char_length(coalesce(d ->> 'message', '')) <= 500;
    when 'email' then
      return public.is_valid_email(d ->> 'email')
         and char_length(coalesce(d ->> 'subject', '')) <= 200
         and char_length(coalesce(d ->> 'body', '')) <= 1000;
    when 'maps' then
      return (d ? 'url' and public.is_safe_http_url(d ->> 'url'))
          or (d ? 'latitude' and d ? 'longitude'
              and jsonb_typeof(d -> 'latitude') = 'number'
              and jsonb_typeof(d -> 'longitude') = 'number'
              and (d ->> 'latitude')::double precision between -90 and 90
              and (d ->> 'longitude')::double precision between -180 and 180);
    when 'wifi' then
      return char_length(coalesce(d ->> 'ssid', '')) between 1 and 32
         and coalesce(d ->> 'encryption', 'WPA') in ('WPA', 'WEP', 'nopass')
         and char_length(coalesce(d ->> 'password', '')) <= 63;
    when 'contact_card' then
      return char_length(coalesce(d ->> 'full_name', '')) between 1 and 120
         and (d ->> 'phone' is null or public.is_valid_phone(d ->> 'phone'))
         and (d ->> 'email' is null or public.is_valid_email(d ->> 'email'))
         and (d ->> 'website' is null or public.is_safe_http_url(d ->> 'website'));
    else
      return false;
  end case;
end;
$$;

alter table public.content_blocks drop constraint if exists content_blocks_type_check;
alter table public.content_blocks add constraint content_blocks_type_check check (type in
  ('heading', 'text', 'image', 'gallery', 'document', 'button', 'link',
   'phone', 'whatsapp', 'social', 'map', 'email', 'contact', 'wifi',
   'menu', 'payment', 'review'));

create or replace function public.is_valid_content_block(p_type text, d jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return false;
  end if;
  case p_type
    when 'heading' then
      return char_length(coalesce(d ->> 'text', '')) between 1 and 160;
    when 'text' then
      return char_length(coalesce(d ->> 'text', '')) between 1 and 4000;
    when 'image' then
      return d ? 'file_id' and char_length(coalesce(d ->> 'caption', '')) <= 200;
    when 'gallery' then
      return jsonb_typeof(d -> 'file_ids') = 'array' and jsonb_array_length(d -> 'file_ids') between 1 and 24;
    when 'document' then
      return d ? 'file_id';
    when 'button', 'link' then
      return char_length(coalesce(d ->> 'label', '')) between 1 and 80
         and public.is_safe_http_url(d ->> 'url');
    when 'phone' then
      return public.is_valid_phone(d ->> 'phone');
    when 'whatsapp' then
      return public.is_valid_phone(d ->> 'phone') and char_length(coalesce(d ->> 'message', '')) <= 500;
    when 'social' then
      return public.is_safe_http_url(d ->> 'url');
    when 'map' then
      return (d ? 'url' and public.is_safe_http_url(d ->> 'url'))
          or (jsonb_typeof(d -> 'latitude') = 'number' and jsonb_typeof(d -> 'longitude') = 'number');
    when 'email' then
      return public.is_valid_email(d ->> 'email')
         and char_length(coalesce(d ->> 'subject', '')) <= 200
         and char_length(coalesce(d ->> 'label', '')) <= 80;
    when 'contact' then
      return char_length(coalesce(d ->> 'full_name', '')) between 1 and 120
         and (d ->> 'phone' is null or public.is_valid_phone(d ->> 'phone'))
         and (d ->> 'email' is null or public.is_valid_email(d ->> 'email'))
         and (d ->> 'website' is null or public.is_safe_http_url(d ->> 'website'))
         and char_length(coalesce(d ->> 'title', '')) <= 120
         and char_length(coalesce(d ->> 'organization', '')) <= 160
         and char_length(coalesce(d ->> 'address', '')) <= 300;
    when 'wifi' then
      return char_length(coalesce(d ->> 'ssid', '')) between 1 and 32
         and coalesce(d ->> 'encryption', 'WPA') in ('WPA', 'WEP', 'nopass')
         and char_length(coalesce(d ->> 'password', '')) <= 63;
    when 'menu' then
      return public.is_valid_menu(d);
    when 'payment' then
      return public.is_valid_payment(d);
    when 'review' then
      return public.is_valid_review(d);
    else
      return false;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Public payload: resolve pictures and PDFs, and the expired state
-- ---------------------------------------------------------------------------
create or replace function public.public_file_list(p_ids jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.public_file_json(x::uuid) order by o)
                    filter (where public.public_file_json(x::uuid) is not null), '[]'::jsonb)
    from jsonb_array_elements_text(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end)
         with ordinality as t(x, o)
   where public.is_uuid_text(x)
$$;

-- Turns stored file ids inside a destination or item into public file objects.
create or replace function public.resolve_public_files(d jsonb, p_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.is_uuid_text(d #>> '{theme,bg_image_file_id}') then
    d := jsonb_set(d, '{theme,bg_image}', coalesce(public.public_file_json((d #>> '{theme,bg_image_file_id}')::uuid), 'null'::jsonb));
    d := d #- '{theme,bg_image_file_id}';
  end if;
  if p_type = 'landing_page' then
    if public.is_uuid_text(d ->> 'avatar_file_id') then
      d := d || jsonb_build_object('avatar', public.public_file_json((d ->> 'avatar_file_id')::uuid));
    end if;
    if public.is_uuid_text(d ->> 'cover_file_id') then
      d := d || jsonb_build_object('cover', public.public_file_json((d ->> 'cover_file_id')::uuid));
    end if;
    d := d - 'avatar_file_id' - 'cover_file_id';
  elsif p_type = 'menu' then
    if public.is_uuid_text(d ->> 'file_id') then
      d := d || jsonb_build_object('file', public.public_file_json((d ->> 'file_id')::uuid));
    end if;
    if jsonb_typeof(d -> 'file_ids') = 'array' then
      d := d || jsonb_build_object('files', public.public_file_list(d -> 'file_ids'));
    end if;
    d := d - 'file_id' - 'file_ids';
  end if;
  return d;
end;
$$;

create or replace function public.public_block_json(p_block public.content_blocks)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d jsonb := p_block.data;
  files jsonb;
begin
  if p_block.type in ('image', 'document') then
    d := d || jsonb_build_object('file', public.public_file_json((d ->> 'file_id')::uuid));
    if d -> 'file' = 'null'::jsonb then
      return null; -- referenced file missing or private: hide the block
    end if;
  elsif p_block.type = 'gallery' then
    files := public.public_file_list(d -> 'file_ids');
    if jsonb_array_length(files) = 0 then
      return null;
    end if;
    d := d || jsonb_build_object('files', files);
  elsif p_block.type = 'menu' then
    d := public.resolve_public_files(d, 'menu');
    if (d ->> 'mode' = 'pdf' and coalesce(d -> 'file', 'null'::jsonb) = 'null'::jsonb)
       or (d ->> 'mode' = 'images' and jsonb_array_length(coalesce(d -> 'files', '[]'::jsonb)) = 0) then
      return null;
    end if;
  end if;
  return jsonb_build_object('id', p_block.id, 'type', p_block.type, 'data', d - 'file_id' - 'file_ids');
end;
$$;

create or replace function public.get_public_qr(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.qr_codes;
  b public.businesses;
  dest jsonb;
  biz jsonb;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{6,32}$' then
    return jsonb_build_object('state', 'not_found');
  end if;

  select * into q from public.qr_codes where public_code = p_code;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;

  select * into b from public.businesses where id = q.business_id;

  -- Unavailable: say so, but expose nothing about the owner.
  if q.archived_at is not null or q.status <> 'active'
     or b.archived_at is not null or b.status <> 'active' then
    return jsonb_build_object('state', 'unavailable', 'code', q.public_code);
  end if;
  if q.expires_at is not null and q.expires_at <= now() then
    return jsonb_build_object('state', 'expired', 'code', q.public_code);
  end if;

  -- Wi-Fi codes are static (credentials are encoded in the printed QR itself).
  if q.type = 'wifi' then
    return jsonb_build_object('state', 'static', 'code', q.public_code, 'type', q.type);
  end if;

  dest := public.resolve_public_files(q.destination, q.type);
  if q.type = 'document' then
    dest := dest || jsonb_build_object('file', public.public_file_json(q.file_id));
  end if;

  biz := public.public_business_payload(
           b.id,
           case when q.type = 'landing_page' then q.id else null end);
  if b.is_workspace then
    -- Only what the page needs; the hidden owner's name is never shown.
    biz := jsonb_strip_nulls(jsonb_build_object(
      'name', '', 'slug', '', 'accent_color', b.accent_color,
      'is_workspace', true, 'blocks', biz -> 'blocks'));
  end if;

  return jsonb_build_object(
    'state', 'ok',
    'code', q.public_code,
    'type', q.type,
    'destination', dest,
    'business', biz);
end;
$$;

-- Files used by a page style, menu or logo cannot be deleted from under it.
create or replace function public.file_usage(p_file_id uuid)
returns table (usage_type text, entity_id uuid, entity_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'qr_code', q.id, q.name
    from public.qr_codes q
   where q.file_id = p_file_id
      or strpos(q.destination::text, p_file_id::text) > 0
      or strpos(q.design::text, p_file_id::text) > 0
  union all
  select 'business_logo', b.id, b.name
    from public.businesses b where b.logo_file_id = p_file_id
  union all
  select 'business_cover', b.id, b.name
    from public.businesses b where b.cover_file_id = p_file_id
  union all
  select 'content_block', c.id, coalesce(q.name, b.name)
    from public.content_blocks c
    join public.businesses b on b.id = c.business_id
    left join public.qr_codes q on q.id = c.qr_code_id
   where strpos(c.data::text, p_file_id::text) > 0
$$;

-- ---------------------------------------------------------------------------
-- 5. Dashboard view picks up the new column
-- ---------------------------------------------------------------------------
drop view if exists public.admin_qr_overview;
create view public.admin_qr_overview
with (security_invoker = true) as
select
  q.*,
  case when b.is_workspace then null else b.name end as business_name,
  b.slug as business_slug,
  b.status as business_status,
  b.archived_at as business_archived_at,
  b.is_workspace as business_is_workspace,
  f.title as file_title,
  ((select count(*) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated)
   + (select coalesce(sum(d.scans), 0) from public.qr_scan_daily d where d.qr_code_id = q.id))::bigint as scan_count,
  coalesce(
    (select max(e.occurred_at) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated),
    (select (max(d.day) + 1)::timestamptz from public.qr_scan_daily d where d.qr_code_id = q.id)) as last_scan_at
from public.qr_codes q
join public.businesses b on b.id = q.business_id
left join public.files f on f.id = q.file_id;

grant select on public.admin_qr_overview to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.public_file_list(jsonb) from public;
revoke all on function public.resolve_public_files(jsonb, text) from public;
grant execute on function
  public.is_valid_theme(jsonb), public.is_valid_payment(jsonb),
  public.is_valid_review(jsonb), public.is_valid_menu(jsonb)
  to authenticated;
