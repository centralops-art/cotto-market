-- 0046: public storage bucket for review photos (Phase 10). Mirrors
-- 0032_drivers_license_storage_bucket.sql's one-step pattern (limits folded
-- in at creation, not a follow-up migration like 0015/0029). Unlike
-- drivers-licenses, this bucket is public -- a review's photo is shown on
-- the vendor's public storefront. Files are stored at
-- `{customer_profile_id}/{filename}` so RLS can scope writes without a join
-- back to reviews (the review row referencing image_url is only created
-- after a successful upload, same order of operations as every other
-- upload-then-insert flow in this app).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-images',
  'review-images',
  true,
  10485760, -- 10 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy review_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'review-images');

create policy review_images_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy review_images_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy review_images_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-images' and (storage.foldername(name))[1] = auth.uid()::text);
