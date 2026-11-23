-- 0064: onboarding for Stripe Direct charges (HANDOFF.md §39 step 3).
--
-- Cooks move from Express accounts to full-dashboard accounts (controller
-- properties: the account pays Stripe fees, Stripe/the account covers
-- losses). An Express account can't be converted, so a vendor whose account
-- is 'express' gets a new account the next time they open Stripe onboarding.
--
-- Under Direct charges the cook is the merchant of record, so Stripe Tax
-- has to be set up on the cook's own account (head office + IL
-- registration). Cotto does this by API (stripe-connect-tax-setup) and
-- records it here. Checkout (step 4) refuses a kitchen until
-- stripe_tax_ready_at is set.

alter table public.vendors
  -- 'express' = old Separate Charges and Transfers account (all accounts
  -- created before this migration). 'full' = full-dashboard account that
  -- can take direct charges.
  add column stripe_account_model text
    check (stripe_account_model in ('express', 'full')),
  -- Illinois Department of Revenue account ID the cook gave us. Kept for
  -- records; Stripe's registration doesn't take it.
  add column il_tax_account_id text,
  add column stripe_tax_registration_id text,
  add column stripe_tax_ready_at timestamptz;

update public.vendors
  set stripe_account_model = 'express'
  where stripe_account_id is not null;

-- Owner UPDATE guard: the Stripe columns are server-only. stripe_account_id
-- was only guarded on INSERT (0021); a cook could repoint it on UPDATE.
-- Under Direct charges that column decides whose account gets charged.
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

  if new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_account_model is distinct from old.stripe_account_model
     or new.il_tax_account_id is distinct from old.il_tax_account_id
     or new.stripe_tax_registration_id is distinct from old.stripe_tax_registration_id
     or new.stripe_tax_ready_at is distinct from old.stripe_tax_ready_at then
    raise exception 'Stripe payment and tax settings can only be changed through Stripe setup';
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
  new.stripe_account_model := null;
  new.il_tax_account_id := null;
  new.stripe_tax_registration_id := null;
  new.stripe_tax_ready_at := null;
  new.published_at := null;
  new.rejected_reason := null;
  new.deleted_at := null;

  return new;
end;
$$;
