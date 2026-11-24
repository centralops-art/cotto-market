-- 0070: public social media links on a kitchen's storefront (HANDOFF.md §48).
-- Additive: older app builds ignore the column. Apply BEFORE any app build or
-- dev client that has §48, which selects the column.
--
-- Vendors type these and every customer can tap them, so the database only
-- accepts profile links on each platform's own domain, not just the app's
-- form. Same patterns as packages/shared/src/social-links.ts; keep in step.

alter table public.vendors add column social_links jsonb not null default '{}'::jsonb;

alter table public.vendors add constraint vendors_social_links_valid check (
  case when jsonb_typeof(social_links) <> 'object' then false else
    social_links - array['instagram', 'facebook', 'tiktok', 'youtube', 'x'] = '{}'::jsonb
    and coalesce(social_links ->> 'instagram' ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}$', not social_links ? 'instagram')
    and coalesce(social_links ->> 'facebook' ~ '^https://www\.facebook\.com/(profile\.php\?id=[0-9]{1,20}|people/[A-Za-z0-9._%-]{1,80}/[0-9]{1,20}|(p|share|groups)/[A-Za-z0-9._%-]{1,80}|[A-Za-z0-9.-]{1,60})$', not social_links ? 'facebook')
    and coalesce(social_links ->> 'tiktok' ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._]{1,24}$', not social_links ? 'tiktok')
    and coalesce(social_links ->> 'youtube' ~ '^https://www\.youtube\.com/(@[A-Za-z0-9._%-]{1,100}|(channel|c|user)/[A-Za-z0-9._%-]{1,100})$', not social_links ? 'youtube')
    and coalesce(social_links ->> 'x' ~ '^https://x\.com/[A-Za-z0-9_]{1,15}$', not social_links ? 'x')
  end
);

-- Since 0068 a new vendors column is unreadable until granted. Public on
-- purpose. Writing it is already covered: owners update their own row (RLS).
grant select (social_links) on public.vendors to anon, authenticated;
