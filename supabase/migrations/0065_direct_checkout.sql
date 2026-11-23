-- 0065: per-kitchen Direct charges checkout (HANDOFF.md §39 step 4).
--
-- 1. vendors.stripe_charges_enabled caches Stripe's charges_enabled for the
--    cook's account. Stripe can accept the onboarding form but still hold
--    card payments (e.g. a full SSN still due), so details_submitted alone
--    isn't "ready". Checkout re-reads it from Stripe before every charge;
--    this copy drives the vendor dashboard banner. Updated by
--    stripe-connect-status, checkout, and (step 5) the Connect webhook.
-- 2. Every-5-minute cron for cron-direct-checkout-cleanup: settles or
--    cancels direct-charge checkouts left pending for 30+ minutes, so a
--    delivery-fee authorization is never left hanging without food.

alter table public.vendors
  add column stripe_charges_enabled boolean not null default false;

-- Same guards as 0064, plus the new column (server-only).
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
     or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
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
  new.stripe_charges_enabled := false;
  new.il_tax_account_id := null;
  new.stripe_tax_registration_id := null;
  new.stripe_tax_ready_at := null;
  new.published_at := null;
  new.rejected_reason := null;
  new.deleted_at := null;

  return new;
end;
$$;

-- Same pg_cron + pg_net idiom as 0045.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cron-direct-checkout-cleanup') then
    perform cron.schedule(
      'cron-direct-checkout-cleanup',
      '*/5 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-direct-checkout-cleanup',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;
end;
$$;
