-- 0003: delivery onboarding / eligibility (1:1 with vendors)

create type public.delivery_profile_status as enum (
  'not_started',
  'delivery_pending_review',
  'delivery_active',
  'delivery_suspended'
);

create type public.vehicle_type as enum ('sedan', 'suv', 'truck', 'bike', 'ebike', 'scooter', 'on_foot');

create table public.vendor_delivery_profiles (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors (id) on delete cascade,
  status public.delivery_profile_status not null default 'not_started',
  drivers_license_front_url text,
  drivers_license_back_url text,
  drivers_license_expires_on date,
  vehicle_type public.vehicle_type,
  insurance_attested_at timestamptz,
  delivery_agreement_accepted_at timestamptz,
  default_radius_miles integer check (default_radius_miles in (3, 5, 10, 15)),
  availability jsonb not null default '{}'::jsonb,
  on_duty boolean not null default false,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_delivery_profiles_status_idx on public.vendor_delivery_profiles (status);
create index vendor_delivery_profiles_on_duty_idx on public.vendor_delivery_profiles (on_duty);

create trigger set_updated_at before update on public.vendor_delivery_profiles
  for each row execute function public.set_updated_at();
