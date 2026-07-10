-- 0002: vendors (cook side) and team member bios

create type public.vendor_status as enum ('pending_review', 'active', 'suspended', 'unpublished');
create type public.layout_style as enum ('compact_list', 'detail_list', 'image_grid', 'detail_grid');

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete restrict,
  region_id uuid not null references public.regions (id) on delete restrict,
  storefront_name text not null,
  slug text not null unique,
  tagline text,
  description text,
  vendor_types text[] not null default '{}',
  address_line1 text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  phone text,
  email text,
  website text,
  header_image_url text,
  theme_palette jsonb not null default '{}'::jsonb,
  layout_style public.layout_style not null default 'compact_list',
  hours jsonb not null default '{}'::jsonb,
  preorder_hours jsonb not null default '{}'::jsonb,
  status public.vendor_status not null default 'pending_review',
  published_at timestamptz,
  platform_fee_pct numeric check (platform_fee_pct between 0 and 100),
  free_trial_ends_at timestamptz,
  stripe_account_id text,
  cfpm_cert_url text,
  cfpm_cert_expires_on date,
  cottage_food_acknowledged_at timestamptz,
  rejected_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_region_id_idx on public.vendors (region_id);
create index vendors_owner_profile_id_idx on public.vendors (owner_profile_id);
create index vendors_status_idx on public.vendors (status);

create trigger set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

-- Bio-only roster entries. Team members do not get a separate login/permission
-- tier: every kitchen and delivery action is performed under the vendor account
-- (owner_profile_id on `vendors`), so profile_id here is an optional link to an
-- existing Cotto profile purely for display, not an access grant.
create table public.vendor_team_members (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  role_title text,
  bio text,
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_team_members_vendor_id_idx on public.vendor_team_members (vendor_id);

create trigger set_updated_at before update on public.vendor_team_members
  for each row execute function public.set_updated_at();
