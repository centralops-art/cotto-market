-- 0009: audit log and the singleton system_settings row

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_target_idx on public.audit_log (target_table, target_id);
create index audit_log_actor_idx on public.audit_log (actor_profile_id);

-- Singleton table: id is pinned to 1 so there can only ever be one row.
create table public.system_settings (
  id integer primary key default 1 check (id = 1),
  default_platform_fee_pct numeric not null default 8 check (default_platform_fee_pct between 0 and 100),
  free_trial_default_days integer not null default 90,
  support_email text not null default 'CentralOps@CottoMarket.com',
  cottage_food_disclaimer_md text not null default '',
  delivery_partner_agreement_md text not null default '',
  admin_allow_list text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();
