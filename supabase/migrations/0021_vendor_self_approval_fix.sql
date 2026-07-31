-- 0021: close the vendor/delivery-profile self-approval hole flagged by
-- external code review. vendors_insert_own and vendor_delivery_profiles_insert
-- (migration 0010) only check ownership -- they never constrained `status` or
-- other privileged columns, and guard_vendor_owner_update /
-- guard_delivery_profile_owner_update only run BEFORE UPDATE, not INSERT. A
-- direct `.insert({..., status: 'active', platform_fee_pct: 0})` bypassed
-- admin review entirely. These BEFORE INSERT triggers force the same
-- privileged columns the UPDATE guards already protect back to their safe
-- defaults for any non-admin/non-service-role caller, regardless of what the
-- client submits.

create or replace function public.guard_vendor_owner_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  new.status := 'draft';
  new.platform_fee_pct := null;
  new.free_trial_ends_at := null;
  new.stripe_account_id := null;
  new.published_at := null;
  new.rejected_reason := null;
  new.deleted_at := null;

  return new;
end;
$$;

create trigger guard_vendor_owner_insert before insert on public.vendors
  for each row execute function public.guard_vendor_owner_insert();

create or replace function public.guard_delivery_profile_owner_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  new.status := 'not_started';
  new.rejected_reason := null;

  return new;
end;
$$;

create trigger guard_delivery_profile_owner_insert before insert on public.vendor_delivery_profiles
  for each row execute function public.guard_delivery_profile_owner_insert();
