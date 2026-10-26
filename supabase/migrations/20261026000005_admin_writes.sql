-- =============================================================================
-- 1 TAP SOLUTION — transactional admin writes
-- Saving a business touches several tables (hours, locations, links). Doing it
-- in one function makes the save atomic: either everything is stored or nothing.
-- SECURITY INVOKER: the caller's RLS policies (admin only) still apply.
-- =============================================================================

create or replace function public.admin_save_business(
  p_id        uuid,
  p_business  jsonb,
  p_hours     jsonb default '[]'::jsonb,
  p_locations jsonb default '[]'::jsonb,
  p_social    jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  b jsonb := p_business;
begin
  perform public.require_admin();

  if v_id is null then
    insert into public.businesses (
      slug, name, category_id, tagline, description, logo_file_id, cover_file_id, phone, whatsapp,
      email, website_url, google_business_url, accent_color, hours_note, custom_fields, status, created_by)
    values (
      b ->> 'slug', b ->> 'name', nullif(b ->> 'category_id', '')::uuid, b ->> 'tagline', b ->> 'description',
      nullif(b ->> 'logo_file_id', '')::uuid, nullif(b ->> 'cover_file_id', '')::uuid, b ->> 'phone', b ->> 'whatsapp',
      b ->> 'email', b ->> 'website_url', b ->> 'google_business_url', coalesce(b ->> 'accent_color', '#2563EB'),
      b ->> 'hours_note', coalesce(b -> 'custom_fields', '[]'::jsonb), coalesce(b ->> 'status', 'active'), auth.uid())
    returning id into v_id;
  else
    update public.businesses set
      slug = b ->> 'slug',
      name = b ->> 'name',
      category_id = nullif(b ->> 'category_id', '')::uuid,
      tagline = b ->> 'tagline',
      description = b ->> 'description',
      logo_file_id = nullif(b ->> 'logo_file_id', '')::uuid,
      cover_file_id = nullif(b ->> 'cover_file_id', '')::uuid,
      phone = b ->> 'phone',
      whatsapp = b ->> 'whatsapp',
      email = b ->> 'email',
      website_url = b ->> 'website_url',
      google_business_url = b ->> 'google_business_url',
      accent_color = coalesce(b ->> 'accent_color', accent_color),
      hours_note = b ->> 'hours_note',
      custom_fields = coalesce(b -> 'custom_fields', '[]'::jsonb),
      status = coalesce(b ->> 'status', status)
    where id = v_id;
    if not found then
      raise exception 'Business not found' using errcode = 'no_data_found';
    end if;
  end if;

  delete from public.business_hours where business_id = v_id;
  insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
  select v_id, (h ->> 'day_of_week')::smallint, (h ->> 'opens_at')::time, (h ->> 'closes_at')::time
    from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) h;

  delete from public.business_locations where business_id = v_id;
  insert into public.business_locations (business_id, label, address, latitude, longitude, maps_url, position)
  select v_id, l ->> 'label', l ->> 'address', (l ->> 'latitude')::double precision,
         (l ->> 'longitude')::double precision, l ->> 'maps_url', (ord - 1)::integer
    from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) with ordinality as x(l, ord);

  delete from public.business_social_links where business_id = v_id;
  insert into public.business_social_links (business_id, platform, label, url, position)
  select v_id, s ->> 'platform', s ->> 'label', s ->> 'url', (ord - 1)::integer
    from jsonb_array_elements(coalesce(p_social, '[]'::jsonb)) with ordinality as x(s, ord);

  return v_id;
end;
$$;

create or replace function public.admin_save_blocks(p_business_id uuid, p_qr_code_id uuid, p_blocks jsonb)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.content_blocks
   where business_id = p_business_id and qr_code_id is not distinct from p_qr_code_id;
  insert into public.content_blocks (business_id, qr_code_id, position, type, data)
  select p_business_id, p_qr_code_id, (ord - 1)::integer, blk ->> 'type', coalesce(blk -> 'data', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as x(blk, ord);
end;
$$;

revoke execute on function public.admin_save_business(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_save_blocks(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_business(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.admin_save_blocks(uuid, uuid, jsonb) to authenticated;
