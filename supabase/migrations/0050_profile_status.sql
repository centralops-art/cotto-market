-- 0050: Phase 11. profiles.status -- lets Central Ops suspend a customer's
-- ability to check out without a full auth lockout (confirmed with the
-- founder: "block checkout only"). Mirrors the existing
-- guard_profile_role_change pattern (0010) so a customer can't smuggle their
-- own status change through profiles_update_own_or_admin, the same way role
-- is already protected.

create type public.profile_status as enum ('active', 'suspended');

alter table public.profiles
  add column status public.profile_status not null default 'active';

create index profiles_status_idx on public.profiles (status);

create or replace function public.guard_profile_status_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and auth.role() <> 'service_role'
     and not public.is_ops_admin() then
    raise exception 'Only an ops admin can change profile status';
  end if;
  return new;
end;
$$;

create trigger guard_profile_status_change before update on public.profiles
  for each row execute function public.guard_profile_status_change();
