-- 0032: private storage bucket for driver's license uploads (Phase 7 delivery
-- onboarding). Mirrors 0013_cfpm_storage_bucket.sql exactly, but folds in the
-- file_size_limit/allowed_mime_types that cfpm-certs only got as a follow-up
-- migration (0029) -- do it in one step this time. Files are stored at
-- `{owner_profile_id}/{filename}` so RLS can scope access without a join back
-- to vendor_delivery_profiles. Admin-only visibility beyond the owner, per
-- spec ("driver's license images visible to admin only").

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drivers-licenses',
  'drivers-licenses',
  false,
  10485760, -- 10 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy drivers_licenses_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'drivers-licenses'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_ops_admin())
  );

create policy drivers_licenses_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'drivers-licenses'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy drivers_licenses_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'drivers-licenses' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'drivers-licenses' and (storage.foldername(name))[1] = auth.uid()::text);

create policy drivers_licenses_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'drivers-licenses' and (storage.foldername(name))[1] = auth.uid()::text);
