-- =============================================================================
-- 1 TAP SOLUTION — QR codes grouped by business, custom menu labels
--   * admin_move_qr: put a QR code (and its page items) under another business,
--     or back under "no business".
--   * admin_quick_business: create a business from just its name.
--   * Menu items may carry a custom label ("Chef's special") besides the
--     built-in tags.
-- Safe to run on a database that already has migrations 0001–0008.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Move a QR code to another business
-- ---------------------------------------------------------------------------
create or replace function public.admin_move_qr(p_qr uuid, p_business uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target uuid := p_business;
  v_old uuid;
  v_type text;
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = 'insufficient_privilege';
  end if;
  if v_target is null then
    v_target := public.admin_workspace_business();
  elsif not exists (select 1 from public.businesses where id = v_target) then
    raise exception 'Business not found' using errcode = 'no_data_found';
  end if;

  select business_id, type into v_old, v_type from public.qr_codes where id = p_qr for update;
  if not found then
    raise exception 'QR code not found' using errcode = 'no_data_found';
  end if;
  if v_old = v_target then
    return;
  end if;
  if v_type = 'business_profile' and exists (select 1 from public.businesses where id = v_target and is_workspace) then
    raise exception 'A business-page code needs a business' using errcode = 'check_violation';
  end if;

  -- Multi-link pages keep the header they had: moving must not swap it for the
  -- business header behind the owner's back.
  update public.qr_codes
     set business_id = v_target,
         destination = case
           when type = 'landing_page' and not (destination ? 'show_business')
             then destination || jsonb_build_object('show_business', false)
           else destination end
   where id = p_qr;

  update public.content_blocks set business_id = v_target where qr_code_id = p_qr;
end;
$$;

revoke all on function public.admin_move_qr(uuid, uuid) from public;
grant execute on function public.admin_move_qr(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A new business from just a name (details can be added later)
-- ---------------------------------------------------------------------------
create or replace function public.admin_quick_business(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_id uuid;
  n integer := 1;
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Enter a business name (up to 120 characters)' using errcode = 'check_violation';
  end if;
  v_base := left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 70);
  if char_length(v_base) < 2 then
    v_base := 'business';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  insert into public.businesses (slug, name, created_by)
  values (v_slug, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_quick_business(text) from public;
grant execute on function public.admin_quick_business(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Menu items: built-in tag and/or a custom label
-- ---------------------------------------------------------------------------
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
             or char_length(coalesce(i ->> 'badge', '')) > 24
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
