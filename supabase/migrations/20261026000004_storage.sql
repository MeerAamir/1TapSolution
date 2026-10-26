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
