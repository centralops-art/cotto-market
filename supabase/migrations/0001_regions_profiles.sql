-- 0001: extensions, shared trigger helper, regions, profiles

create extension if not exists pgcrypto;

-- Generic updated_at trigger used by every table in this project.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.user_role as enum (
  'customer',
  'vendor_owner',
  'vendor_member',
  'ops_admin',
  'ops_owner'
);

create type public.delivery_conflict_rule as enum ('soft_warning', 'hard_block');

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  zip_codes text[] not null default '{}',
  dispatch_contact_name text,
  dispatch_email text,
  dispatch_phone text,
  base_delivery_fee_cents integer not null default 499,
  per_mile_fee_cents integer not null default 150,
  delivery_payout_split_pct numeric not null default 80 check (delivery_payout_split_pct between 0 and 100),
  claim_window_t1_minutes integer not null default 10,
  claim_window_t2_minutes integer not null default 30,
  claim_window_t3_minutes integer not null default 60,
  delivery_conflict_rule public.delivery_conflict_rule not null default 'soft_warning',
  health_regs_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.regions
  for each row execute function public.set_updated_at();

-- Extends auth.users. Note: role is set once at signup and is NOT mutated by the
-- "Become a vendor" flow -- vendor access is derived from ownership of a `vendors`
-- row (see 0002), not from this column. role is only meaningful here for gating
-- the admin app (ops_admin / ops_owner).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  username text unique,
  avatar_url text,
  allergen_preferences text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profiles row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
