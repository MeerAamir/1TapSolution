-- =============================================================================
-- 1 TAP SOLUTION — complete database setup (all migrations + demo data)
-- Paste this whole file into Supabase → SQL Editor → New query, then Run.
-- Run it ONCE on a new, empty project. Generated from supabase/migrations + seed.sql.
-- =============================================================================

-- >>>>> supabase/migrations/20261026000001_core_schema.sql
-- =============================================================================
-- 1 TAP SOLUTION — core schema
-- -----------------------------------------------------------------------------
-- Conventions
--   * Internal ids are UUIDs. Public QR URLs use a separate, random public_code.
--   * Every mutable table has created_at / updated_at (maintained by trigger).
--   * Enumerations are text + CHECK constraints so they can evolve with a
--     simple migration instead of ALTER TYPE.
--   * Lifecycle:  status ('active' | 'inactive')  +  archived_at (soft archive)
--                 + hard DELETE (explicit, confirmed in the UI).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Validation helpers (IMMUTABLE so they can be used in CHECK constraints)
-- ---------------------------------------------------------------------------

-- Only absolute http(s) URLs. Blocks javascript:, data:, vbscript:, file:, etc.
create or replace function public.is_safe_http_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null
     and char_length(p_url) <= 2048
     and p_url ~* '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>"]*)?$'
$$;

create or replace function public.is_valid_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Optional leading +, then 6-15 digits (spaces, dashes, dots and brackets allowed).
  select p_phone is not null
     and p_phone ~ '^\+?[0-9 ().-]{6,24}$'
     and char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) between 6 and 15
$$;

create or replace function public.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and char_length(p_email) <= 254
     and p_email ~* '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
$$;

create or replace function public.is_hex_color(p_color text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_color ~ '^#[0-9A-Fa-f]{6}$'
$$;

-- Keeps updated_at honest without relying on the client.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrators
--   Rows are created only with the service role / SQL editor (see docs/ADMIN_SETUP.md).
--   There is deliberately NO insert/update policy for this table.
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'admin' check (role in ('owner', 'admin', 'editor')),
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at   timestamptz not null default now()
);

comment on table public.admin_users is
  'Who may use the dashboard. Managed only via SQL/service role; never writable from the browser.';

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text check (description is null or char_length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_custom_fields(p_fields jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  f jsonb;
begin
  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 20 then
    return false;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object'
       or jsonb_typeof(f -> 'label') <> 'string'
       or jsonb_typeof(f -> 'value') <> 'string'
       or char_length(f ->> 'label') not between 1 and 60
       or char_length(f ->> 'value') not between 1 and 500 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique
                        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  category_id         uuid references public.categories (id) on delete set null,
  tagline             text check (tagline is null or char_length(tagline) <= 160),
  description         text check (description is null or char_length(description) <= 4000),
  logo_file_id        uuid,  -- FK added after public.files exists
  cover_file_id       uuid,
  phone               text check (phone is null or public.is_valid_phone(phone)),
  whatsapp            text check (whatsapp is null or public.is_valid_phone(whatsapp)),
  email               text check (email is null or public.is_valid_email(email)),
  website_url         text check (website_url is null or public.is_safe_http_url(website_url)),
  google_business_url text check (google_business_url is null or public.is_safe_http_url(google_business_url)),
  accent_color        text not null default '#2563EB' check (public.is_hex_color(accent_color)),
  hours_note          text check (hours_note is null or char_length(hours_note) <= 200),
  custom_fields       jsonb not null default '[]'::jsonb check (public.is_valid_custom_fields(custom_fields)),
  status              text not null default 'active' check (status in ('active', 'inactive')),
  archived_at         timestamptz,
  is_demo             boolean not null default false,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index businesses_category_idx on public.businesses (category_id);
create index businesses_status_idx on public.businesses (status, archived_at);
create index businesses_created_idx on public.businesses (created_at desc);
create index businesses_name_lower_idx on public.businesses (lower(name));

create table public.business_locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  label       text not null default 'Main location' check (char_length(label) between 1 and 80),
  address     text check (address is null or char_length(address) <= 400),
  latitude    double precision check (latitude is null or latitude between -90 and 90),
  longitude   double precision check (longitude is null or longitude between -180 and 180),
  maps_url    text check (maps_url is null or public.is_safe_http_url(maps_url)),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index business_locations_business_idx on public.business_locations (business_id, position);

create table public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Monday
  opens_at    time not null,
  closes_at   time not null,
  created_at  timestamptz not null default now(),
  check (opens_at <> closes_at)
);
create index business_hours_business_idx on public.business_hours (business_id, day_of_week, opens_at);

create table public.business_social_links (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  platform    text not null check (platform in
                ('instagram', 'facebook', 'youtube', 'linkedin', 'x', 'tiktok',
                 'pinterest', 'threads', 'telegram', 'google_business', 'website', 'other')),
  label       text check (label is null or char_length(label) <= 60),
  url         text not null check (public.is_safe_http_url(url)),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index business_social_links_business_idx on public.business_social_links (business_id, position);

-- ---------------------------------------------------------------------------
-- Files (metadata only — binaries live in Supabase Storage)
-- ---------------------------------------------------------------------------
create table public.files (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid references public.businesses (id) on delete set null,
  bucket            text not null check (bucket in ('public-files', 'private-files')),
  storage_path      text not null check (storage_path ~ '^[a-z0-9-]+/[a-z0-9-]+\.(pdf|png|jpg|webp|gif)$'),
  title             text not null check (char_length(btrim(title)) between 1 and 160),
  description       text check (description is null or char_length(description) <= 1000),
  original_filename text check (original_filename is null or char_length(original_filename) <= 255),
  mime_type         text not null check (mime_type in
                      ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes        bigint not null check (size_bytes > 0),
  kind              text generated always as
                      (case when mime_type = 'application/pdf' then 'document' else 'image' end) stored,
  show_on_profile   boolean not null default false,
  position          integer not null default 0,
  version           integer not null default 1 check (version >= 1),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index files_business_idx on public.files (business_id, position);
create index files_created_idx on public.files (created_at desc);

alter table public.businesses
  add constraint businesses_logo_file_fk  foreign key (logo_file_id)  references public.files (id) on delete set null,
  add constraint businesses_cover_file_fk foreign key (cover_file_id) references public.files (id) on delete set null;

-- ---------------------------------------------------------------------------
-- QR codes
-- ---------------------------------------------------------------------------
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
    when 'business_profile', 'landing_page' then
      return true;
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

create table public.qr_codes (
  id           uuid primary key default gen_random_uuid(),
  public_code  text not null unique check (public_code ~ '^[A-Za-z0-9_-]{6,32}$'),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  description  text check (description is null or char_length(description) <= 1000),
  type         text not null check (type in
                 ('business_profile', 'document', 'website', 'phone', 'whatsapp', 'email',
                  'maps', 'social', 'wifi', 'contact_card', 'custom_link', 'landing_page')),
  destination  jsonb not null default '{}'::jsonb,
  file_id      uuid references public.files (id) on delete restrict,
  design       jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  status       text not null default 'active' check (status in ('active', 'inactive')),
  archived_at  timestamptz,
  is_demo      boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint qr_codes_destination_valid check (public.is_valid_qr_destination(type, destination)),
  constraint qr_codes_document_has_file check (type <> 'document' or file_id is not null)
);
create index qr_codes_business_idx on public.qr_codes (business_id);
create index qr_codes_status_idx on public.qr_codes (status, archived_at);
create index qr_codes_created_idx on public.qr_codes (created_at desc);
create index qr_codes_file_idx on public.qr_codes (file_id) where file_id is not null;

comment on column public.qr_codes.public_code is
  'Opaque, permanent identifier encoded in the printed QR (/q/<public_code>). Never changes.';
comment on column public.qr_codes.destination is
  'Current destination configuration. Editing it changes where the SAME printed QR leads.';

-- Random public code: 10 base62 characters from gen_random_uuid() entropy (~59 bits).
create or replace function public.generate_public_code(p_length integer default 10)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; -- no 0/O/1/l/I
  raw bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  result text := '';
  i integer;
begin
  for i in 0 .. p_length - 1 loop
    result := result || substr(alphabet, (get_byte(raw, i) % char_length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.qr_codes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_code is null then
      loop
        new.public_code := public.generate_public_code(10);
        exit when not exists (select 1 from public.qr_codes where public_code = new.public_code);
      end loop;
    end if;
  elsif tg_op = 'UPDATE' then
    -- The printed QR must keep working: the public code is immutable.
    if new.public_code is distinct from old.public_code then
      raise exception 'public_code is permanent and cannot be changed' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger qr_codes_before_write
  before insert or update on public.qr_codes
  for each row execute function public.qr_codes_before_write();

-- ---------------------------------------------------------------------------
-- Content blocks (business profile extras & custom landing pages)
--   qr_code_id IS NULL  -> block belongs to the business profile page
--   qr_code_id NOT NULL -> block belongs to that landing-page QR
-- ---------------------------------------------------------------------------
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
    else
      return false;
  end case;
end;
$$;

create table public.content_blocks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  qr_code_id  uuid references public.qr_codes (id) on delete cascade,
  position    integer not null default 0,
  type        text not null check (type in
                ('heading', 'text', 'image', 'gallery', 'document', 'button', 'link',
                 'phone', 'whatsapp', 'social', 'map')),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint content_blocks_data_valid check (public.is_valid_content_block(type, data))
);
create index content_blocks_owner_idx on public.content_blocks (business_id, qr_code_id, position);

-- ---------------------------------------------------------------------------
-- Scan analytics (written only through record_qr_scan(); see 0003)
--   * No IP address is ever stored.
--   * visitor_hash = SHA-256(daily secret salt + IP + user agent), computed at
--     the edge. Salt rotates daily, so hashes cannot be linked across days.
-- ---------------------------------------------------------------------------
create table public.qr_scan_events (
  id               bigint generated always as identity primary key,
  qr_code_id       uuid references public.qr_codes (id) on delete set null,
  business_id      uuid references public.businesses (id) on delete set null,
  qr_type          text not null,
  occurred_at      timestamptz not null default now(),
  device_category  text not null default 'other' check (device_category in ('mobile', 'tablet', 'desktop', 'other')),
  browser_category text not null default 'other' check (browser_category in
                     ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'in_app', 'other')),
  visitor_hash     text check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$'),
  is_simulated     boolean not null default false
);
create index qr_scan_events_qr_time_idx on public.qr_scan_events (qr_code_id, occurred_at desc);
create index qr_scan_events_business_time_idx on public.qr_scan_events (business_id, occurred_at desc);
create index qr_scan_events_time_idx on public.qr_scan_events (occurred_at desc);

-- ---------------------------------------------------------------------------
-- Contact form submissions (public marketing site)
-- ---------------------------------------------------------------------------
create table public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  email      text not null check (public.is_valid_email(email)),
  phone      text check (phone is null or public.is_valid_phone(phone)),
  company    text check (company is null or char_length(company) <= 160),
  message    text not null check (char_length(btrim(message)) between 10 and 4000),
  status     text not null default 'new' check (status in ('new', 'read', 'archived')),
  ip_hash    text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index contact_submissions_created_idx on public.contact_submissions (created_at desc);
create index contact_submissions_ip_idx on public.contact_submissions (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  summary     text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Server-side secrets (never readable through the API)
-- ---------------------------------------------------------------------------
create table public.app_secrets (
  name       text primary key,
  value_hash text not null,
  updated_at timestamptz not null default now()
);
comment on table public.app_secrets is
  'Hashes of server-to-database secrets (e.g. the edge ingest secret). No API access.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger business_locations_updated_at before update on public.business_locations
  for each row execute function public.set_updated_at();
create trigger business_social_links_updated_at before update on public.business_social_links
  for each row execute function public.set_updated_at();
create trigger files_updated_at before update on public.files
  for each row execute function public.set_updated_at();
create trigger qr_codes_updated_at before update on public.qr_codes
  for each row execute function public.set_updated_at();
create trigger content_blocks_updated_at before update on public.content_blocks
  for each row execute function public.set_updated_at();

-- >>>>> supabase/migrations/20261026000002_security.sql
-- =============================================================================
-- 1 TAP SOLUTION — authorization, Row Level Security, integrity & audit triggers
-- -----------------------------------------------------------------------------
-- Access model (also documented in docs/SECURITY.md):
--   anon (public visitors) : NO direct table access. Only the SECURITY DEFINER
--                            RPCs get_public_qr() / get_public_business(), which
--                            return just the published fields of active records.
--   authenticated          : table access only if the user is in admin_users
--                            (checked in every policy via public.is_admin()).
--   edge functions         : record_qr_scan() / submit_contact_form() require a
--                            shared ingest secret whose hash lives in app_secrets.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Baseline privileges: start from nothing, grant deliberately.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Admin-managed tables: authenticated may attempt CRUD; RLS decides.
grant select, insert, update, delete on
  public.categories,
  public.businesses,
  public.business_locations,
  public.business_hours,
  public.business_social_links,
  public.files,
  public.qr_codes,
  public.content_blocks
to authenticated;

grant select, update, delete on public.contact_submissions to authenticated;
grant select on public.qr_scan_events, public.audit_logs, public.admin_users to authenticated;
-- app_secrets: no grants at all.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (including tables without policies => deny all).
-- ---------------------------------------------------------------------------
alter table public.admin_users           enable row level security;
alter table public.categories            enable row level security;
alter table public.businesses            enable row level security;
alter table public.business_locations    enable row level security;
alter table public.business_hours        enable row level security;
alter table public.business_social_links enable row level security;
alter table public.files                 enable row level security;
alter table public.qr_codes              enable row level security;
alter table public.content_blocks        enable row level security;
alter table public.qr_scan_events        enable row level security;
alter table public.contact_submissions   enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.app_secrets           enable row level security;

-- admin_users: a signed-in user may see their own row (so the app can tell if
-- they are an admin); admins may see all. No write policies => no self-promotion.
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Full CRUD for admins on management tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'businesses', 'business_locations', 'business_hours',
    'business_social_links', 'files', 'qr_codes', 'content_blocks'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
  end loop;
end;
$$;

create policy qr_scan_events_admin_select on public.qr_scan_events
  for select to authenticated using (public.is_admin());

create policy contact_submissions_admin_select on public.contact_submissions
  for select to authenticated using (public.is_admin());
create policy contact_submissions_admin_update on public.contact_submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy contact_submissions_admin_delete on public.contact_submissions
  for delete to authenticated using (public.is_admin());

create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- File usage & deletion guard
-- ---------------------------------------------------------------------------
create or replace function public.file_usage(p_file_id uuid)
returns table (usage_type text, entity_id uuid, entity_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'qr_code', q.id, q.name
    from public.qr_codes q where q.file_id = p_file_id
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
   where c.data ->> 'file_id' = p_file_id::text
      or (jsonb_typeof(c.data -> 'file_ids') = 'array' and c.data -> 'file_ids' ? p_file_id::text)
$$;

revoke all on function public.file_usage(uuid) from public;
grant execute on function public.file_usage(uuid) to authenticated;

create or replace function public.files_prevent_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n from public.file_usage(old.id);
  if n > 0 then
    raise exception 'File "%" is still used in % place(s). Remove those references first.', old.title, n
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

create trigger files_prevent_delete_in_use
  before delete on public.files
  for each row execute function public.files_prevent_delete_in_use();

-- Public-facing references (logo, cover, document QR, blocks) must use public files.
create or replace function public.assert_public_file(p_file_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_file_id is not null and not exists (
    select 1 from public.files where id = p_file_id and bucket = 'public-files'
  ) then
    raise exception 'Only files in the public bucket can be shown to visitors'
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.businesses_check_files()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_public_file(new.logo_file_id);
  perform public.assert_public_file(new.cover_file_id);
  return new;
end;
$$;
create trigger businesses_check_files
  before insert or update of logo_file_id, cover_file_id on public.businesses
  for each row execute function public.businesses_check_files();

create or replace function public.qr_codes_check_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_public_file(new.file_id);
  return new;
end;
$$;
create trigger qr_codes_check_file
  before insert or update of file_id on public.qr_codes
  for each row execute function public.qr_codes_check_file();

-- Landing-page blocks must belong to the same business as their QR code.
create or replace function public.content_blocks_check_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.qr_code_id is not null and not exists (
    select 1 from public.qr_codes where id = new.qr_code_id and business_id = new.business_id
  ) then
    raise exception 'Content block QR code belongs to a different business' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger content_blocks_check_owner
  before insert or update on public.content_blocks
  for each row execute function public.content_blocks_check_owner();

-- Files moved to the private bucket cannot remain linked to public pages.
create or replace function public.files_check_visibility_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bucket = 'private-files' and old.bucket = 'public-files' then
    if exists (select 1 from public.file_usage(new.id)) then
      raise exception 'This file is used on a public page and cannot be made private'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger files_check_visibility_change
  before update of bucket on public.files
  for each row execute function public.files_check_visibility_change();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  action text := lower(tg_op);
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed
      from jsonb_each(rec) n
     where n.key not in ('updated_at')
       and n.value is distinct from prev -> n.key;
    if changed is null then
      return null; -- no meaningful change
    end if;
    if 'archived_at' = any(changed) then
      action := case when rec ->> 'archived_at' is null then 'restore' else 'archive' end;
    elsif changed = array['status'] then
      action := case when rec ->> 'status' = 'active' then 'activate' else 'deactivate' end;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary, details)
  values (
    auth.uid(),
    action,
    tg_table_name,
    nullif(coalesce(rec ->> 'id', rec ->> 'user_id'), '')::uuid,
    coalesce(rec ->> 'name', rec ->> 'title', rec ->> 'role'),
    case when changed is not null then jsonb_build_object('changed', to_jsonb(changed)) else '{}'::jsonb end
  );
  return null;
end;
$$;

create trigger audit_businesses after insert or update or delete on public.businesses
  for each row execute function public.audit_row_change();
create trigger audit_qr_codes after insert or update or delete on public.qr_codes
  for each row execute function public.audit_row_change();
create trigger audit_files after insert or update or delete on public.files
  for each row execute function public.audit_row_change();
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger audit_admin_users after insert or update or delete on public.admin_users
  for each row execute function public.audit_row_change();

-- >>>>> supabase/migrations/20261026000003_rpc.sql
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

-- >>>>> supabase/migrations/20261026000004_storage.sql
-- =============================================================================
-- 1 TAP SOLUTION — Supabase Storage buckets & policies
--   public-files  : public read by URL (logos, photos, menus, brochures shown to
--                   visitors). No listing for anonymous users (no select policy).
--   private-files : admin-only. Never linked from public pages.
-- Uploads/changes are allowed only for administrators.
-- Size limit: 10 MB per file (Supabase Free allows up to 50 MB; raise here and in
-- VITE_MAX_UPLOAD_MB together if needed).
-- SVG/HTML are intentionally NOT allowed (they can carry script).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-files', 'public-files', true, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('private-files', 'private-files', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins read managed files"
  on storage.objects for select to authenticated
  using (bucket_id in ('public-files', 'private-files') and public.is_admin());

create policy "Admins upload managed files"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('public-files', 'private-files') and public.is_admin());

create policy "Admins update managed files"
  on storage.objects for update to authenticated
  using (bucket_id in ('public-files', 'private-files') and public.is_admin())
  with check (bucket_id in ('public-files', 'private-files') and public.is_admin());

create policy "Admins delete managed files"
  on storage.objects for delete to authenticated
  using (bucket_id in ('public-files', 'private-files') and public.is_admin());

-- >>>>> supabase/migrations/20261026000005_admin_writes.sql
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

-- >>>>> supabase/migrations/20261026000006_free_tier_guards.sql
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

-- >>>>> supabase/seed.sql
-- =============================================================================
-- 1 TAP SOLUTION — demonstration data
--   Every demo business is flagged is_demo = true and labelled "(Demo)".
--   Phone numbers are non-working placeholders; emails use example.com.
--   No scan events are seeded: dashboards only show real scans.
--   Document QRs (menu, brochure) need real PDF files in Storage, so they are
--   created by `npm run seed:files` (scripts/seed-demo-files.mjs).
-- Safe to re-run: existing rows with the same slug / public_code are skipped.
-- =============================================================================

insert into public.categories (name, slug, description) values
  ('Restaurants & Cafés',   'restaurants-cafes',     'Menus, tables, specials and reservations'),
  ('Hotels & Stays',        'hotels-stays',          'Hotels, guest houses and homestays'),
  ('Education',             'education',             'Schools, colleges, academies and coaching'),
  ('Retail',                'retail',                'Shops, boutiques and showrooms'),
  ('Professional Services', 'professional-services', 'Consultants, agencies and individual professionals'),
  ('Healthcare',            'healthcare',            'Clinics, pharmacies and practitioners'),
  ('Real Estate',           'real-estate',           'Listings, projects and agents'),
  ('Events',                'events',                'Event organisers and venues'),
  ('Salons & Wellness',     'salons-wellness',       'Salons, spas and service providers'),
  ('Manufacturing',         'manufacturing',         'Product packaging and manufacturer information')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
insert into public.businesses
  (slug, name, category_id, tagline, description, phone, whatsapp, email, website_url,
   accent_color, hours_note, custom_fields, is_demo)
values
  ('demo-chinar-leaf-cafe', 'Chinar Leaf Café (Demo)',
   (select id from public.categories where slug = 'restaurants-cafes'),
   'Slow coffee, fresh bakes and warm kahwa',
   'This is a demonstration business page. A neighbourhood café serving specialty coffee, kahwa, fresh bakes and all-day breakfast. Scan the table QR to see today''s menu.',
   '+91 00000 00001', '+910000000001', 'hello@example.com', 'https://example.com',
   '#B45309', 'Kitchen closes 30 minutes before closing time.',
   '[{"label":"Wi-Fi","value":"Ask at the counter"},{"label":"Seating","value":"Indoor and garden"}]', true),

  ('demo-lakeview-residency', 'Lakeview Residency (Demo)',
   (select id from public.categories where slug = 'hotels-stays'),
   'A quiet stay by the water',
   'This is a demonstration business page. A 24-room boutique hotel with lake-facing rooms, an in-house restaurant and airport pickup on request.',
   '+91 00000 00002', '+910000000002', 'stay@example.com', 'https://example.com',
   '#0E7490', 'Check-in 12:00, check-out 11:00. Reception is open 24 hours.', '[]', true),

  ('demo-northstar-academy', 'Northstar Academy (Demo)',
   (select id from public.categories where slug = 'education'),
   'Admissions open for the new session',
   'This is a demonstration business page. A senior secondary school offering science, commerce and humanities streams, with transport and hostel facilities.',
   '+91 00000 00003', null, 'admissions@example.com', 'https://example.com',
   '#4338CA', 'Admissions office closed on public holidays.', '[]', true),

  ('demo-loom-and-thread', 'Loom & Thread (Demo)',
   (select id from public.categories where slug = 'retail'),
   'Handwoven shawls and home textiles',
   'This is a demonstration business page. A small studio store selling handwoven shawls, stoles and home textiles, with worldwide shipping.',
   '+91 00000 00004', '+910000000004', 'shop@example.com', 'https://example.com',
   '#BE185D', null, '[]', true),

  ('demo-aisha-rahman-architect', 'Aisha Rahman, Architect (Demo)',
   (select id from public.categories where slug = 'professional-services'),
   'Residential and hospitality architecture',
   'This is a demonstration business page for an individual professional.',
   '+91 00000 00005', '+910000000005', 'studio@example.com', 'https://example.com',
   '#0F766E', null, '[]', true)
on conflict (slug) do nothing;

-- Locations (coordinates are generic city-centre points for demonstration)
insert into public.business_locations (business_id, label, address, latitude, longitude, position)
select b.id, v.label, v.address, v.lat, v.lng, v.pos
from (values
  ('demo-chinar-leaf-cafe',   'Main café',     '12 Example Street, Demo City', 28.6315, 77.2167, 0),
  ('demo-lakeview-residency', 'Hotel',         '1 Lakeshore Road, Demo City',  28.6129, 77.2295, 0),
  ('demo-northstar-academy',  'Main campus',   '45 College Road, Demo City',   28.6448, 77.2167, 0),
  ('demo-northstar-academy',  'Junior wing',   '9 Garden Lane, Demo City',     28.6400, 77.2100, 1),
  ('demo-loom-and-thread',    'Studio store',  '7 Market Lane, Demo City',     28.6505, 77.2303, 0)
) as v(slug, label, address, lat, lng, pos)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.business_locations l where l.business_id = b.id and l.label = v.label);

-- Opening hours (0 = Monday)
insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, o::time, c::time
from public.businesses b
cross join lateral (values
  (0, '08:00', '22:00'), (1, '08:00', '22:00'), (2, '08:00', '22:00'), (3, '08:00', '22:00'),
  (4, '08:00', '23:00'), (5, '09:00', '23:00'), (6, '09:00', '21:00')) as h(d, o, c)
where b.slug = 'demo-chinar-leaf-cafe'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, '09:00'::time, '16:00'::time
from public.businesses b cross join generate_series(0, 5) as d
where b.slug = 'demo-northstar-academy'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

insert into public.business_hours (business_id, day_of_week, opens_at, closes_at)
select b.id, d, '10:30'::time, '19:30'::time
from public.businesses b cross join generate_series(0, 6) as d
where b.slug = 'demo-loom-and-thread'
  and not exists (select 1 from public.business_hours x where x.business_id = b.id);

-- Social links (platform home pages only — no invented accounts)
insert into public.business_social_links (business_id, platform, url, position)
select b.id, v.platform, v.url, v.pos
from (values
  ('demo-chinar-leaf-cafe',  'instagram', 'https://www.instagram.com/', 0),
  ('demo-chinar-leaf-cafe',  'google_business', 'https://www.google.com/business/', 1),
  ('demo-lakeview-residency','facebook',  'https://www.facebook.com/', 0),
  ('demo-northstar-academy', 'youtube',   'https://www.youtube.com/', 0),
  ('demo-northstar-academy', 'facebook',  'https://www.facebook.com/', 1),
  ('demo-loom-and-thread',   'instagram', 'https://www.instagram.com/', 0),
  ('demo-loom-and-thread',   'pinterest', 'https://www.pinterest.com/', 1),
  ('demo-loom-and-thread',   'youtube',   'https://www.youtube.com/', 2),
  ('demo-aisha-rahman-architect', 'linkedin', 'https://www.linkedin.com/', 0)
) as v(slug, platform, url, pos)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.business_social_links s where s.business_id = b.id and s.platform = v.platform);

-- Profile content blocks
insert into public.content_blocks (business_id, position, type, data)
select b.id, v.pos, v.type, v.data::jsonb
from (values
  ('demo-chinar-leaf-cafe', 0, 'heading', '{"text":"Today''s specials"}'),
  ('demo-chinar-leaf-cafe', 1, 'text', '{"text":"Saffron kahwa pot for two, walnut brownie, and a seasonal fruit tart. Ask our team about vegan options."}'),
  ('demo-lakeview-residency', 0, 'heading', '{"text":"Guest services"}'),
  ('demo-lakeview-residency', 1, 'text', '{"text":"Airport pickup, laundry, guided lake tours and a 24-hour front desk. Message us on WhatsApp for anything you need during your stay."}')
) as v(slug, pos, type, data)
join public.businesses b on b.slug = v.slug
where not exists (select 1 from public.content_blocks c where c.business_id = b.id and c.qr_code_id is null);

-- ---------------------------------------------------------------------------
-- QR codes (fixed demo codes so marketing material can reference them)
-- ---------------------------------------------------------------------------
insert into public.qr_codes (public_code, business_id, name, description, type, destination, design, is_demo)
select v.code, b.id, v.name, v.description, v.type, v.destination::jsonb, v.design::jsonb, true
from (values
  ('demoCafe01', 'demo-chinar-leaf-cafe', 'Chinar Leaf Café — Table QR', 'Placed on every table. Opens the café profile.',
   'business_profile', '{}', '{"fg":"#1C1917","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","frame":true,"cta":"Scan for menu","ecl":"Q"}'),
  ('demoHotel01', 'demo-lakeview-residency', 'Lakeview Residency — Reception', 'Reception desk standee.',
   'business_profile', '{}', '{"fg":"#0B1020","bg":"#FFFFFF","dots":"square","eyes":"square","frame":true,"cta":"Scan to explore","ecl":"M"}'),
  ('demoHotelMap', 'demo-lakeview-residency', 'Lakeview Residency — Directions', 'Printed on booking confirmations.',
   'maps', '{"latitude":28.6129,"longitude":77.2295,"label":"Lakeview Residency (Demo)"}', '{"ecl":"M"}'),
  ('demoHotelWA', 'demo-lakeview-residency', 'Lakeview Residency — WhatsApp concierge', 'In-room card.',
   'whatsapp', '{"phone":"+910000000002","message":"Hello, I am a guest and need help with…"}', '{"ecl":"M"}'),
  ('demoAcademy1', 'demo-northstar-academy', 'Northstar Academy — Admissions', 'Admissions banner at the gate.',
   'business_profile', '{}', '{"fg":"#312E81","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","ecl":"Q"}'),
  ('demoStore01', 'demo-loom-and-thread', 'Loom & Thread — New collection', 'Shop window poster. Custom landing page.',
   'landing_page', '{"title":"The Winter Collection"}', '{"fg":"#831843","bg":"#FFFFFF","dots":"rounded","eyes":"rounded","frame":true,"cta":"Shop the look","ecl":"Q"}'),
  ('demoStoreIG', 'demo-loom-and-thread', 'Loom & Thread — Instagram', 'Shopping-bag tag.',
   'social', '{"platform":"instagram","url":"https://www.instagram.com/"}', '{"ecl":"M"}'),
  ('demoCard01', 'demo-aisha-rahman-architect', 'Aisha Rahman — Business card', 'Back of printed visiting card.',
   'contact_card', '{"full_name":"Aisha Rahman","title":"Principal Architect","organization":"Studio Rahman (Demo)","phone":"+91 00000 00005","email":"studio@example.com","website":"https://example.com","address":"Demo City","note":"Demonstration contact card"}',
   '{"fg":"#134E4A","bg":"#FFFFFF","dots":"square","eyes":"rounded","ecl":"M"}')
) as v(code, slug, name, description, type, destination, design)
join public.businesses b on b.slug = v.slug
on conflict (public_code) do nothing;

-- Landing page blocks for the store QR
insert into public.content_blocks (business_id, qr_code_id, position, type, data)
select q.business_id, q.id, v.pos, v.type, v.data::jsonb
from (values
  (0, 'heading', '{"text":"The Winter Collection"}'),
  (1, 'text', '{"text":"Twelve new handwoven pieces in undyed wool and natural madder red. Every shawl is woven on a traditional handloom and takes up to three weeks to finish."}'),
  (2, 'button', '{"label":"Browse the collection","url":"https://example.com"}'),
  (3, 'whatsapp', '{"phone":"+910000000004","message":"Hi! I saw the Winter Collection poster.","label":"Ask about a piece"}'),
  (4, 'social', '{"platform":"instagram","url":"https://www.instagram.com/","label":"Follow on Instagram"}')
) as v(pos, type, data)
cross join public.qr_codes q
where q.public_code = 'demoStore01'
  and not exists (select 1 from public.content_blocks c where c.qr_code_id = q.id);
