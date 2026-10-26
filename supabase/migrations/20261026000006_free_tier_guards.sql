-- =============================================================================
-- 1 TAP SOLUTION — free-tier guards
--   1. Keep-alive heartbeat: a tiny write every few hours so a Supabase Free
--      project never counts as inactive (inactive Free projects are paused).
--   2. Scan compaction: raw scan events older than 90 days are rolled up into
--      daily totals, so the database stays far below the 500 MB Free limit.
--   3. Usage meter for the dashboard (database and file storage size).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Heartbeat
-- ---------------------------------------------------------------------------
create table public.app_heartbeat (
  id              smallint primary key default 1 check (id = 1),
  beats           bigint not null default 0,
  last_beat       timestamptz not null default now(),
  source          text,
  last_compaction timestamptz not null default 'epoch'
);
alter table public.app_heartbeat enable row level security;
insert into public.app_heartbeat (id, last_beat) values (1, 'epoch') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Daily scan totals (older than 90 days)
-- ---------------------------------------------------------------------------
create table public.qr_scan_daily (
  day              date not null,
  qr_code_id       uuid references public.qr_codes (id) on delete set null,
  business_id      uuid references public.businesses (id) on delete set null,
  qr_type          text not null,
  device_category  text not null,
  browser_category text not null,
  scans            integer not null check (scans >= 0),
  unique_visitors  integer not null check (unique_visitors >= 0)
);
create index qr_scan_daily_day_idx on public.qr_scan_daily (day);
create index qr_scan_daily_qr_idx on public.qr_scan_daily (qr_code_id, day);
create index qr_scan_daily_business_idx on public.qr_scan_daily (business_id, day);
alter table public.qr_scan_daily enable row level security;
create policy qr_scan_daily_admin_select on public.qr_scan_daily
  for select to authenticated using (public.is_admin());
grant select on public.qr_scan_daily to authenticated;

-- Rolls raw events older than p_days into daily totals (UTC days) and deletes
-- them. Unique visitors are counted before the visitor hashes disappear.
-- Also clears contact-form hashes older than 30 days. Replaces the job that
-- used prune_scan_identifiers (kept for compatibility).
create or replace function public.compact_scan_events(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => p_days);
  n integer;
begin
  insert into public.qr_scan_daily
    (day, qr_code_id, business_id, qr_type, device_category, browser_category, scans, unique_visitors)
  select (e.occurred_at at time zone 'UTC')::date, e.qr_code_id, e.business_id, e.qr_type,
         e.device_category, e.browser_category, count(*), count(distinct e.visitor_hash)
    from public.qr_scan_events e
   where e.occurred_at < cutoff and not e.is_simulated
   group by 1, 2, 3, 4, 5, 6;

  delete from public.qr_scan_events where occurred_at < cutoff;
  get diagnostics n = row_count;

  update public.contact_submissions set ip_hash = null
   where ip_hash is not null and created_at < now() - interval '30 days';
  return n;
end;
$$;

-- Called by the keep-alive jobs (public key). Bumps one counter row (a real
-- database write, so the project never counts as inactive) and, at most once a
-- day, runs the scan compaction, so no separate scheduler is needed.
-- Rate-limited to one write per minute however often it is called.
create or replace function public.keep_alive(p_source text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h public.app_heartbeat;
  compacted integer := null;
begin
  update public.app_heartbeat
     set beats = beats + 1,
         last_beat = now(),
         source = left(coalesce(p_source, 'unknown'), 40)
   where id = 1 and last_beat < now() - interval '1 minute'
  returning * into h;
  if h is null then
    select * into h from public.app_heartbeat where id = 1;
  elsif h.last_compaction < now() - interval '1 day' then
    compacted := public.compact_scan_events(90);
    update public.app_heartbeat set last_compaction = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true, 'last_beat', h.last_beat, 'beats', h.beats, 'compacted', compacted);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Analytics read raw events (last 90 days) + daily totals (older)
-- ---------------------------------------------------------------------------
create or replace view public.admin_business_overview
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
left join public.categories c on c.id = b.category_id;

create or replace view public.admin_qr_overview
with (security_invoker = true) as
select
  q.*,
  b.name as business_name,
  b.slug as business_slug,
  b.status as business_status,
  b.archived_at as business_archived_at,
  f.title as file_title,
  ((select count(*) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated)
   + (select coalesce(sum(d.scans), 0) from public.qr_scan_daily d where d.qr_code_id = q.id))::bigint as scan_count,
  coalesce(
    (select max(e.occurred_at) from public.qr_scan_events e where e.qr_code_id = q.id and not e.is_simulated),
    (select (max(d.day) + 1)::timestamptz from public.qr_scan_daily d where d.qr_code_id = q.id)) as last_scan_at
from public.qr_codes q
join public.businesses b on b.id = q.business_id
left join public.files f on f.id = q.file_id;

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
  if p_to - p_from > interval '800 days' then
    raise exception 'range too large';
  end if;
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
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
  ),
  old as (
    -- Daily totals are stored per UTC day.
    select date_trunc(p_interval, dd.day::timestamp)::date as b,
           sum(dd.scans)::bigint as scans,
           sum(dd.unique_visitors)::bigint as uniq
      from public.qr_scan_daily dd
     where dd.day >= (p_from at time zone 'UTC')::date and dd.day < (p_to at time zone 'UTC')::date + 1
       and (p_qr_code_id is null or dd.qr_code_id = p_qr_code_id)
       and (p_business_id is null or dd.business_id = p_business_id)
     group by 1
  )
  select s.b,
         (select count(*) from ev where ev.b = s.b)
           + coalesce((select o.scans from old o where o.b = s.b), 0),
         (select count(*) from (select distinct ev.d, ev.visitor_hash from ev
                                 where ev.b = s.b and ev.visitor_hash is not null) u)
           + coalesce((select o.uniq from old o where o.b = s.b), 0)
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
  with counts as (
    select e.qr_code_id as id, count(*)::bigint as n
      from public.qr_scan_events e
     where e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_simulated
     group by 1
    union all
    select d.qr_code_id, sum(d.scans)::bigint
      from public.qr_scan_daily d
     where d.day >= (p_from at time zone 'UTC')::date and d.day < (p_to at time zone 'UTC')::date + 1
     group by 1
  )
  select q.id, q.name, b.name, q.type, q.status, sum(c.n)::bigint
    from counts c
    join public.qr_codes q on q.id = c.id
    join public.businesses b on b.id = q.business_id
   where (p_business_id is null or q.business_id = p_business_id)
   group by q.id, q.name, b.name, q.type, q.status
   order by sum(c.n) desc, q.name
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
  with rows as (
    select case p_dimension when 'device' then e.device_category when 'browser' then e.browser_category else e.qr_type end as l,
           1::bigint as n
      from public.qr_scan_events e
     where e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_simulated
       and (p_qr_code_id is null or e.qr_code_id = p_qr_code_id)
       and (p_business_id is null or e.business_id = p_business_id)
    union all
    select case p_dimension when 'device' then d.device_category when 'browser' then d.browser_category else d.qr_type end,
           d.scans::bigint
      from public.qr_scan_daily d
     where d.day >= (p_from at time zone 'UTC')::date and d.day < (p_to at time zone 'UTC')::date + 1
       and (p_qr_code_id is null or d.qr_code_id = p_qr_code_id)
       and (p_business_id is null or d.business_id = p_business_id)
  )
  select r.l, sum(r.n)::bigint from rows r group by r.l order by sum(r.n) desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Usage meter (sizes against the Supabase Free plan limits)
-- ---------------------------------------------------------------------------
create or replace function public.admin_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'file_bytes', (select coalesce(sum(size_bytes), 0) from public.files),
    'file_count', (select count(*) from public.files),
    'raw_scan_rows', (select count(*) from public.qr_scan_events),
    'daily_scan_rows', (select count(*) from public.qr_scan_daily),
    'last_heartbeat', (select last_beat from public.app_heartbeat where id = 1),
    'heartbeat_source', (select source from public.app_heartbeat where id = 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (same allow-list approach as migration 03)
-- ---------------------------------------------------------------------------
revoke execute on function public.keep_alive(text), public.compact_scan_events(integer), public.admin_usage()
  from public, anon, authenticated;
grant execute on function public.keep_alive(text) to anon, authenticated;
grant execute on function public.admin_usage() to authenticated;
-- compact_scan_events: SQL editor / pg_cron only.
revoke all on public.app_heartbeat from anon, authenticated;
revoke all on public.qr_scan_daily from anon;
revoke all on public.admin_business_overview, public.admin_qr_overview from anon;
grant select on public.admin_business_overview, public.admin_qr_overview to authenticated;
