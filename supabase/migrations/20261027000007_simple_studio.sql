-- =============================================================================
-- 1 TAP SOLUTION — simple QR studio
--   * A hidden "workspace" owner, so QR codes no longer need a business.
--   * New QR type: text.
--   * Landing pages get their own header (title, subtitle, image, cover, colour).
--   * New landing-page items: email, contact card (vCard) and Wi-Fi details.
-- Safe to run on a database that already has migrations 0001–0006.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Workspace owner
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists is_workspace boolean not null default false;
create unique index if not exists businesses_one_workspace on public.businesses ((true)) where is_workspace;

comment on column public.businesses.is_workspace is
  'The hidden owner of QR codes created without a business. Never listed or shown publicly.';

-- Returns (and creates on first use) the workspace owner. Administrators only.
create or replace function public.admin_workspace_business()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := 'my-qr-codes';
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = 'insufficient_privilege';
  end if;
  select id into v_id from public.businesses where is_workspace;
  if found then
    return v_id;
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then
    v_slug := v_slug || '-' || regexp_replace(lower(public.generate_public_code(6)), '[^a-z0-9]', 'x', 'g');
  end if;
  insert into public.businesses (slug, name, is_workspace, created_by)
  values (v_slug, 'My QR codes', true, auth.uid())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.businesses where is_workspace;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_workspace_business() from public;
grant execute on function public.admin_workspace_business() to authenticated;

-- The workspace never has a public /b/ page.
create or replace function public.get_public_business(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('state', 'ok', 'business', public.public_business_payload(b.id))
       from public.businesses b
      where b.slug = lower(p_slug)
        and b.status = 'active'
        and b.archived_at is null
        and not b.is_workspace),
    jsonb_build_object('state', 'not_found'))
$$;

-- ---------------------------------------------------------------------------
-- 2. QR types and destinations
-- ---------------------------------------------------------------------------
alter table public.qr_codes drop constraint if exists qr_codes_type_check;
alter table public.qr_codes add constraint qr_codes_type_check check (type in
  ('business_profile', 'document', 'website', 'phone', 'whatsapp', 'email',
   'maps', 'social', 'wifi', 'contact_card', 'custom_link', 'landing_page', 'text'));

create or replace function public.is_uuid_text(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$$;

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

-- ---------------------------------------------------------------------------
-- 3. Landing-page items
-- ---------------------------------------------------------------------------
alter table public.content_blocks drop constraint if exists content_blocks_type_check;
alter table public.content_blocks add constraint content_blocks_type_check check (type in
  ('heading', 'text', 'image', 'gallery', 'document', 'button', 'link',
   'phone', 'whatsapp', 'social', 'map', 'email', 'contact', 'wifi'));

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
    else
      return false;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Public payload: landing header images and the workspace flag
-- ---------------------------------------------------------------------------
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

  -- Wi-Fi codes are static (credentials are encoded in the printed QR itself).
  if q.type = 'wifi' then
    return jsonb_build_object('state', 'static', 'code', q.public_code, 'type', q.type);
  end if;

  dest := q.destination;
  if q.type = 'document' then
    dest := dest || jsonb_build_object('file', public.public_file_json(q.file_id));
  elsif q.type = 'landing_page' then
    if public.is_uuid_text(dest ->> 'avatar_file_id') then
      dest := dest || jsonb_build_object('avatar', public.public_file_json((dest ->> 'avatar_file_id')::uuid));
    end if;
    if public.is_uuid_text(dest ->> 'cover_file_id') then
      dest := dest || jsonb_build_object('cover', public.public_file_json((dest ->> 'cover_file_id')::uuid));
    end if;
    dest := dest - 'avatar_file_id' - 'cover_file_id';
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

-- ---------------------------------------------------------------------------
-- 5. Dashboard views and stats leave the workspace out of "businesses"
-- ---------------------------------------------------------------------------
drop view if exists public.admin_business_overview;
create view public.admin_business_overview
with (security_invoker = true) as
select
  b.*,
  c.name as category_name,
  (select count(*) from public.qr_codes q where q.business_id = b.id) as qr_count,
  ((select count(*) from public.qr_scan_events e where e.business_id = b.id and not e.is_simulated)
   + (select coalesce(sum(d.scans), 0) from public.qr_scan_daily d where d.business_id = b.id))::bigint as scan_count,
  coalesce(
    (select max(e.occurred_at) from public.qr_scan_events e where e.business_id = b.id and not e.is_simulated),
    (select (max(d.day) + 1)::timestamptz from public.qr_scan_daily d where d.business_id = b.id)) as last_scan_at
from public.businesses b
left join public.categories c on c.id = b.category_id
where not b.is_workspace;

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

grant select on public.admin_business_overview, public.admin_qr_overview to authenticated;

create or replace function public.admin_overview_stats(p_include_simulated boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'businesses_total',  (select count(*) from public.businesses where archived_at is null and not is_workspace),
    'businesses_active', (select count(*) from public.businesses where archived_at is null and status = 'active' and not is_workspace),
    'businesses_archived', (select count(*) from public.businesses where archived_at is not null and not is_workspace),
    'qr_total',    (select count(*) from public.qr_codes where archived_at is null),
    'qr_active',   (select count(*) from public.qr_codes where archived_at is null and status = 'active'),
    'qr_inactive', (select count(*) from public.qr_codes where archived_at is null and status = 'inactive'),
    'qr_archived', (select count(*) from public.qr_codes where archived_at is not null),
    'scans_total', (select count(*) from public.qr_scan_events where p_include_simulated or not is_simulated)
                   + (select coalesce(sum(scans), 0) from public.qr_scan_daily),
    'scans_30d',   (select count(*) from public.qr_scan_events
                     where (p_include_simulated or not is_simulated) and occurred_at > now() - interval '30 days'),
    'unique_visitors_30d', (select count(*) from (
                              select distinct date_trunc('day', occurred_at), visitor_hash
                                from public.qr_scan_events
                               where visitor_hash is not null
                                 and (p_include_simulated or not is_simulated)
                                 and occurred_at > now() - interval '30 days') d),
    'files_total', (select count(*) from public.files),
    'messages_new', (select count(*) from public.contact_submissions where status = 'new')
  ) into result;
  return result;
end;
$$;

grant execute on function public.is_uuid_text(text) to authenticated;
