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
