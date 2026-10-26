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
