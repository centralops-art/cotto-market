-- 0012: cook onboarding wizard support -- vendors start as 'draft' while the
-- wizard is in progress, self-submit to 'pending_review' when done.

alter table public.vendors alter column status set default 'draft';

-- Replaces the guard from migration 0010: owners may now also self-submit
-- draft -> pending_review (the wizard's final "Submit for review" step),
-- in addition to the existing active <-> unpublished publish toggle.
-- Approval/rejection/suspension remain admin-only.
create or replace function public.guard_vendor_owner_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_ops_admin() then
    return new;
  end if;

  if new.platform_fee_pct is distinct from old.platform_fee_pct
     or new.free_trial_ends_at is distinct from old.free_trial_ends_at
     or new.owner_profile_id is distinct from old.owner_profile_id
     or new.region_id is distinct from old.region_id then
    raise exception 'Only an ops admin can change platform_fee_pct, free_trial_ends_at, owner_profile_id, or region_id';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'pending_review' then
      -- self-submit: allowed
    elsif old.status in ('active', 'unpublished') and new.status in ('active', 'unpublished') then
      -- publish toggle: allowed
    else
      raise exception 'Vendors cannot self-transition status from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

-- CFPM cert expiration warning tracking -- lets the daily cron (Phase 2 edge
-- function) know it already sent the T-60 admin warning for a given cert, so
-- it doesn't re-email every day until expiry.
alter table public.vendors add column cfpm_expiry_warned_at timestamptz;
