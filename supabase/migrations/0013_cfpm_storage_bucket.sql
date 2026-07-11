-- 0013: private storage bucket for CFPM certificate uploads.
-- Files are stored at `{owner_profile_id}/{filename}` so RLS can scope access
-- without a join back to `vendors`. Admin-only visibility beyond the owner,
-- per spec ("CFPM cert visible (admin only) on the vendor record").

insert into storage.buckets (id, name, public)
values ('cfpm-certs', 'cfpm-certs', false)
on conflict (id) do nothing;

create policy cfpm_certs_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cfpm-certs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_ops_admin())
  );

create policy cfpm_certs_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cfpm-certs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy cfpm_certs_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'cfpm-certs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cfpm-certs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy cfpm_certs_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'cfpm-certs' and (storage.foldername(name))[1] = auth.uid()::text);
