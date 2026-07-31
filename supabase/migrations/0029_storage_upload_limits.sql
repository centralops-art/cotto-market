-- 0029: neither storage bucket (migrations 0013, 0015) had file_size_limit
-- or allowed_mime_types set, flagged by external code review (HANDOFF.md
-- §12 item 9). vendor-media is public and served directly to any visitor --
-- without a MIME restriction it's an unrestricted free file host; without a
-- size limit, storage cost is unbounded. cfpm-certs is private/admin-only
-- but the same unbounded-size concern applies, and certs are commonly
-- scanned as PDFs, not just photos.

update storage.buckets
set file_size_limit = 10485760, -- 10 MiB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'cfpm-certs';

update storage.buckets
set file_size_limit = 10485760, -- 10 MiB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vendor-media';
