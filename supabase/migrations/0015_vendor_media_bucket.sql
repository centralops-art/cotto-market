-- 0015: public storage bucket for storefront-facing images (header photo,
-- menu item photos, team member photos). Unlike cfpm-certs, this bucket is
-- public -- customers need to see these images. Files are stored at
-- `{vendor_id}/{filename}`, scoped to the owning vendor for writes.

insert into storage.buckets (id, name, public)
values ('vendor-media', 'vendor-media', true)
on conflict (id) do nothing;

create policy vendor_media_public_read on storage.objects
  for select to public
  using (bucket_id = 'vendor-media');

create policy vendor_media_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vendor-media'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_profile_id = auth.uid()
    )
  );

create policy vendor_media_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vendor-media'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_profile_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'vendor-media'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_profile_id = auth.uid()
    )
  );

create policy vendor_media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vendor-media'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1] and v.owner_profile_id = auth.uid()
    )
  );
