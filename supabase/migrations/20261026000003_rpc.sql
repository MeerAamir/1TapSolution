-- =============================================================================
-- 1 TAP SOLUTION — RPC functions
--   Public (anon):  get_public_qr, get_public_business
--   Edge (secret):  edge_resolve_qr (resolve + record scan), submit_contact_form
--   Admin:          admin_* analytics, list views
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Payload builders (internal; not callable by API roles)
-- ---------------------------------------------------------------------------
create or replace function public.public_file_json(p_file_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', f.id,
           'title', f.title,
           'description', f.description,
           'path', f.storage_path,
           'mime_type', f.mime_type,
           'size_bytes', f.size_bytes,
           'kind', f.kind,
           'version', f.version,
           'updated_at', f.updated_at)
    from public.files f
   where f.id = p_file_id
     and f.bucket = 'public-files'
$$;

-- Resolves file references inside a block into public file objects.
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
    select coalesce(jsonb_agg(public.public_file_json(x::uuid)) filter (where public.public_file_json(x::uuid) is not null), '[]'::jsonb)
      into files
      from jsonb_array_elements_text(d -> 'file_ids') x;
    if jsonb_array_length(files) = 0 then
      return null;
    end if;
    d := d || jsonb_build_object('files', files);
  end if;
  return jsonb_build_object('id', p_block.id, 'type', p_block.type, 'data', d - 'file_id' - 'file_ids');
end;
$$;

create or replace function public.public_business_payload(p_business_id uuid, p_qr_code_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', b.name,
    'slug', b.slug,
    'tagline', b.tagline,
    'description', b.description,
    'category', c.name,
    'accent_color', b.accent_color,
    'logo', public.public_file_json(b.logo_file_id),
    'cover', public.public_file_json(b.cover_file_id),
    'phone', b.phone,
    'whatsapp', b.whatsapp,
    'email', b.email,
    'website_url', b.website_url,
    'google_business_url', b.google_business_url,
    'hours_note', b.hours_note,
    'is_demo', b.is_demo,
    'custom_fields', case when jsonb_array_length(b.custom_fields) > 0 then b.custom_fields end,
    'hours', (select jsonb_agg(jsonb_build_object(
                       'day', h.day_of_week,
                       'opens', to_char(h.opens_at, 'HH24:MI'),
                       'closes', to_char(h.closes_at, 'HH24:MI'))
                     order by h.day_of_week, h.opens_at)
                from public.business_hours h where h.business_id = b.id),
    'locations', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                           'label', l.label, 'address', l.address,
                           'latitude', l.latitude, 'longitude', l.longitude,
                           'maps_url', l.maps_url)) order by l.position, l.created_at)
                    from public.business_locations l where l.business_id = b.id),
    'social_links', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'platform', s.platform, 'label', s.label, 'url', s.url))
                            order by s.position, s.created_at)
                       from public.business_social_links s where s.business_id = b.id),
    'documents', (select jsonb_agg(public.public_file_json(f.id) order by f.position, f.created_at)
                    from public.files f
                   where f.business_id = b.id and f.bucket = 'public-files'
                     and f.show_on_profile and f.kind = 'document'),
    'gallery', (select jsonb_agg(public.public_file_json(f.id) order by f.position, f.created_at)
                  from public.files f
                 where f.business_id = b.id and f.bucket = 'public-files'
                   and f.show_on_profile and f.kind = 'image'
                   and f.id is distinct from b.logo_file_id and f.id is distinct from b.cover_file_id),
    'blocks', (select jsonb_agg(x.j order by x.position, x.created_at)
                 from (select public.public_block_json(cb) as j, cb.position, cb.created_at
                         from public.content_blocks cb
                        where cb.business_id = b.id
                          and cb.qr_code_id is not distinct from p_qr_code_id) x
                where x.j is not null)
  ))
  from public.businesses b
  left join public.categories c on c.id = b.category_id
  where b.id = p_business_id
$$;

revoke all on function public.public_file_json(uuid) from public;
revoke all on function public.public_block_json(public.content_blocks) from public;
revoke all on function public.public_business_payload(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Public read API
-- ---------------------------------------------------------------------------
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
        and b.archived_at is null),
    jsonb_build_object('state', 'not_found'))
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
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{6,32}$' then
    return jsonb_build_object('state', 'not_found');
  end if;

  select * into q from public.qr_codes where public_code = p_code;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;

  select * into b from public.businesses where id = q.business_id;

  -- Unavailable: say so, but expose nothing about the business.
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
  end if;

  return jsonb_build_object(
    'state', 'ok',
    'code', q.public_code,
    'type', q.type,
    'destination', dest,
    'business', public.public_business_payload(
                  b.id,
                  case when q.type = 'landing_page' then q.id else null end));
end;
$$;

revoke all on function public.get_public_business(text) from public;
revoke all on function public.get_public_qr(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_public_qr(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Edge ingest (scan recording, contact form) — guarded by a shared secret
-- ---------------------------------------------------------------------------
create or replace function public.check_edge_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_secret is not null
     and char_length(p_secret) >= 32
     and exists (
       select 1 from public.app_secrets
        where name = 'edge_ingest'
          and value_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
$$;
revoke all on function public.check_edge_secret(text) from public;

-- Run once from the SQL editor (as postgres). Not exposed to API roles.
create or replace function public.set_edge_ingest_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'Secret must be at least 32 characters';
  end if;
  insert into public.app_secrets (name, value_hash, updated_at)
  values ('edge_ingest', encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), now())
  on conflict (name) do update set value_hash = excluded.value_hash, updated_at = now();
end;
$$;
revoke all on function public.set_edge_ingest_secret(text) from public;

-- Resolve a QR code for the edge function AND record one scan for it.
-- Attribution model: one scan event per QR request served at /q/<code>.
-- The SPA never records scans, so redirect + page load cannot double count.
create or replace function public.edge_resolve_qr(
  p_secret        text,
  p_code          text,
  p_device        text default 'other',
  p_browser       text default 'other',
  p_visitor_hash  text default null,
  p_record        boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  q public.qr_codes;
  v_hash text := case when p_visitor_hash ~ '^[0-9a-f]{64}$' then p_visitor_hash end;
  recorded boolean := false;
begin
  if not public.check_edge_secret(p_secret) then
    raise exception 'invalid ingest secret' using errcode = 'insufficient_privilege';
  end if;

  payload := public.get_public_qr(p_code);

  if p_record and payload ->> 'state' = 'ok' then
    select * into q from public.qr_codes where public_code = p_code;

    -- Guard 1: same visitor + same QR within 30 s is one visit (prefetch, double tap, reload).
    -- Guard 2: cap at 60 events per visitor per QR per hour (abuse/automation).
    if v_hash is null or not exists (
         select 1 from public.qr_scan_events e
          where e.qr_code_id = q.id and e.visitor_hash = v_hash
            and e.occurred_at > now() - interval '30 seconds')
       and (select count(*) from public.qr_scan_events e
             where e.qr_code_id = q.id and e.visitor_hash = v_hash
               and e.occurred_at > now() - interval '1 hour') < 60
    then
      insert into public.qr_scan_events (qr_code_id, business_id, qr_type, device_category, browser_category, visitor_hash)
      values (
        q.id, q.business_id, q.type,
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'other' end,
        case when p_browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'in_app') then p_browser else 'other' end,
        v_hash);
      recorded := true;
    end if;
  end if;

  return payload || jsonb_build_object('recorded', recorded);
end;
$$;

revoke all on function public.edge_resolve_qr(text, text, text, text, text, boolean) from public;
grant execute on function public.edge_resolve_qr(text, text, text, text, text, boolean) to anon;

create or replace function public.submit_contact_form(
  p_secret  text,
  p_name    text,
  p_email   text,
  p_phone   text,
  p_company text,
  p_message text,
  p_ip_hash text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text := case when p_ip_hash ~ '^[0-9a-f]{64}$' then p_ip_hash end;
begin
  if not public.check_edge_secret(p_secret) then
    raise exception 'invalid ingest secret' using errcode = 'insufficient_privilege';
  end if;

  if v_hash is not null and (select count(*) from public.contact_submissions
                              where ip_hash = v_hash and created_at > now() - interval '1 hour') >= 3 then
    return 'rate_limited';
  end if;
  if (select count(*) from public.contact_submissions where created_at > now() - interval '1 hour') >= 100 then
    return 'rate_limited';
  end if;

  insert into public.contact_submissions (name, email, phone, company, message, ip_hash)
  values (btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''), nullif(btrim(p_company), ''),
          btrim(p_message), v_hash);
  return 'ok';
end;
$$;

revoke all on function public.submit_contact_form(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_form(text, text, text, text, text, text, text) to anon;

-- Privacy: drop visitor hashes after N days (schedule with pg_cron, see docs).
create or replace function public.prune_scan_identifiers(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.qr_scan_events set visitor_hash = null
   where visitor_hash is not null and occurred_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  update public.contact_submissions set ip_hash = null
   where ip_hash is not null and created_at < now() - interval '30 days';
  return n;
end;
$$;
revoke all on function public.prune_scan_identifiers(integer) from public;

-- ---------------------------------------------------------------------------
-- Admin list views (security_invoker => RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view public.admin_business_overview
with (security_invoker = true) as
select
  b.*,
  c.name as category_name,
  (select count(*) from public.qr_codes q where q.business_id = b.id) as qr_count,
  (select count(*) from public.qr_scan_events e where e.business_id = b.id and not e.is_simulated) as scan_count,
  (select max(e.occurred_at) from public.qr_scan_events e where e.business_id = b.id and not e.is_simulated) as last_scan_at
from public.businesses b
left join public.categories c on c.id = b.category_id;

create view public.admin_qr_overview
with (security_invoker = true) as
select
  q.*,
  b.name as business_name,
  b.slug as business_slug,
  b.status as business_status,
  b.archived_at as business_archived_at,
  f.title as file_title,
  (select count(*) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated) as scan_count,
  (select max(e.occurred_at) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated) as last_scan_at
from public.qr_codes q
join public.businesses b on b.id = q.business_id
left join public.files f on f.id = q.file_id;

create view public.admin_file_overview
with (security_invoker = true) as
select
  f.*,
  b.name as business_name,
  (select count(*) from public.file_usage(f.id)) as usage_count
from public.files f
left join public.businesses b on b.id = f.business_id;

revoke all on public.admin_business_overview, public.admin_qr_overview, public.admin_file_overview from anon;
grant select on public.admin_business_overview, public.admin_qr_overview, public.admin_file_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Admin analytics
--   "Unique visitors" = number of distinct daily visitor hashes, summed across
--   days. A person scanning on two different days counts twice. It is an
--   estimate (shared IPs/devices merge, changing networks split).
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

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
    'businesses_total',  (select count(*) from public.businesses where archived_at is null),
    'businesses_active', (select count(*) from public.businesses where archived_at is null and status = 'active'),
    'businesses_archived', (select count(*) from public.businesses where archived_at is not null),
    'qr_total',    (select count(*) from public.qr_codes where archived_at is null),
    'qr_active',   (select count(*) from public.qr_codes where archived_at is null and status = 'active'),
    'qr_inactive', (select count(*) from public.qr_codes where archived_at is null and status = 'inactive'),
    'qr_archived', (select count(*) from public.qr_codes where archived_at is not null),
    'scans_total', (select count(*) from public.qr_scan_events where p_include_simulated or not is_simulated),
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

create or replace function public.admin_scan_series(
  p_from              timestamptz,
  p_to                timestamptz,
  p_interval          text default 'day',
  p_tz                text default 'UTC',
  p_qr_code_id        uuid default null,
  p_business_id       uuid default null,
  p_include_simulated boolean default false
)
returns table (bucket date, scans bigint, unique_visitors bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text := p_tz;
begin
  perform public.require_admin();
  if p_interval not in ('day', 'month') then
    raise exception 'interval must be day or month';
  end if;
  -- Unknown or legacy zone names (e.g. some browsers report Asia/Calcutta):
  -- fall back to UTC rather than failing the whole chart.
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  if p_to - p_from > interval '800 days' then
    raise exception 'range too large';
  end if;

  return query
  with series as (
    select generate_series(
             date_trunc(p_interval, p_from at time zone v_tz),
             date_trunc(p_interval, p_to at time zone v_tz),
             ('1 ' || p_interval)::interval)::date as b
  ),
  ev as (
    select date_trunc(p_interval, e.occurred_at at time zone v_tz)::date as b,
           date_trunc('day', e.occurred_at at time zone v_tz) as d,
           e.visitor_hash
      from public.qr_scan_events e
     where e.occurred_at >= p_from and e.occurred_at < p_to
       and (p_qr_code_id is null or e.qr_code_id = p_qr_code_id)
       and (p_business_id is null or e.business_id = p_business_id)
       and (p_include_simulated or not e.is_simulated)
  )
  select s.b,
         (select count(*) from ev where ev.b = s.b),
         (select count(*) from (select distinct ev.d, ev.visitor_hash from ev
                                 where ev.b = s.b and ev.visitor_hash is not null) u)
    from series s
   order by s.b;
end;
$$;

create or replace function public.admin_top_qr_codes(
  p_from timestamptz,
  p_to   timestamptz,
  p_limit integer default 10,
  p_business_id uuid default null
)
returns table (qr_code_id uuid, name text, business_name text, type text, status text, scans bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select q.id, q.name, b.name, q.type, q.status, count(e.id)
    from public.qr_scan_events e
    join public.qr_codes q on q.id = e.qr_code_id
    join public.businesses b on b.id = q.business_id
   where e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_simulated
     and (p_business_id is null or q.business_id = p_business_id)
   group by q.id, q.name, b.name, q.type, q.status
   order by count(e.id) desc, q.name
   limit least(greatest(p_limit, 1), 50);
end;
$$;

create or replace function public.admin_scan_breakdown(
  p_dimension   text,
  p_from        timestamptz,
  p_to          timestamptz,
  p_qr_code_id  uuid default null,
  p_business_id uuid default null
)
returns table (label text, scans bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_dimension not in ('device', 'browser', 'qr_type') then
    raise exception 'dimension must be device, browser or qr_type';
  end if;
  return query
  select case p_dimension
           when 'device' then e.device_category
           when 'browser' then e.browser_category
           else e.qr_type end as l,
         count(*)
    from public.qr_scan_events e
   where e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_simulated
     and (p_qr_code_id is null or e.qr_code_id = p_qr_code_id)
     and (p_business_id is null or e.business_id = p_business_id)
   group by l
   order by count(*) desc;
end;
$$;

revoke all on function public.require_admin() from public;
revoke all on function public.admin_overview_stats(boolean) from public;
revoke all on function public.admin_scan_series(timestamptz, timestamptz, text, text, uuid, uuid, boolean) from public;
revoke all on function public.admin_top_qr_codes(timestamptz, timestamptz, integer, uuid) from public;
revoke all on function public.admin_scan_breakdown(text, timestamptz, timestamptz, uuid, uuid) from public;
grant execute on function public.require_admin() to authenticated;
grant execute on function public.admin_overview_stats(boolean) to authenticated;
grant execute on function public.admin_scan_series(timestamptz, timestamptz, text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_top_qr_codes(timestamptz, timestamptz, integer, uuid) to authenticated;
grant execute on function public.admin_scan_breakdown(text, timestamptz, timestamptz, uuid, uuid) to authenticated;

-- =============================================================================
-- Function privileges — explicit allow-list.
-- Supabase grants EXECUTE on new functions to anon/authenticated by default, so
-- "revoke from public" alone is NOT enough. Revoke everything, then grant back.
-- =============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- Future functions are private unless explicitly granted.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Public visitors (and admins previewing) read published content.
grant execute on function public.get_public_qr(text), public.get_public_business(text)
  to anon, authenticated;

-- Edge functions call these with the anon key + ingest secret.
grant execute on function public.edge_resolve_qr(text, text, text, text, text, boolean),
  public.submit_contact_form(text, text, text, text, text, text, text)
  to anon;

-- Used by RLS policies, so every API role must be able to evaluate it.
grant execute on function public.is_admin() to anon, authenticated;

-- Used in CHECK constraints and triggers evaluated as the calling admin.
grant execute on function
  public.is_safe_http_url(text), public.is_valid_phone(text), public.is_valid_email(text),
  public.is_hex_color(text), public.is_valid_custom_fields(jsonb),
  public.is_valid_qr_destination(text, jsonb), public.is_valid_content_block(text, jsonb),
  public.generate_public_code(integer), public.assert_public_file(uuid)
  to authenticated;

-- Admin dashboard.
grant execute on function
  public.require_admin(),
  public.file_usage(uuid),
  public.admin_overview_stats(boolean),
  public.admin_scan_series(timestamptz, timestamptz, text, text, uuid, uuid, boolean),
  public.admin_top_qr_codes(timestamptz, timestamptz, integer, uuid),
  public.admin_scan_breakdown(text, timestamptz, timestamptz, uuid, uuid)
  to authenticated;

-- Deliberately NOT granted to any API role:
--   set_edge_ingest_secret, check_edge_secret, prune_scan_identifiers,
--   public_business_payload, public_block_json, public_file_json.
