-- 0063: columns for the switch to Stripe Direct charges (HANDOFF.md §39).
--
-- Under Direct charges each kitchen's food is charged on the cook's own
-- connected account, and the delivery fee is a separate charge on Cotto's
-- platform account. Every new order has exactly one suborder.
--
-- Nothing reads these columns yet. Existing orders stay on the old Separate
-- Charges and Transfers model ('sct'), and the refund paths keep reversing
-- the cook Transfer for them, selected by charge_model.

alter table public.vendor_suborders
  -- 'sct' = charged on the platform, cook paid by Transfer (all orders so far).
  -- 'direct' = food charged on the cook's connected account.
  add column charge_model text not null default 'sct'
    check (charge_model in ('sct', 'direct')),
  -- Cook's connected account, copied from vendors at checkout. Webhook,
  -- refund and tax calls use this, never the vendor's current account.
  add column stripe_account_id text,
  -- Food PaymentIntent, which lives on stripe_account_id (not the platform).
  add column stripe_payment_intent_id text,
  add column stripe_application_fee_id text,
  -- Delivery-fee PaymentIntent on the platform account (null for pickup).
  -- Not unique: a bundled delivery (§40) shares one across suborders.
  add column delivery_payment_intent_id text,
  add constraint vendor_suborders_direct_has_account
    check (charge_model <> 'direct' or stripe_account_id is not null);

create unique index vendor_suborders_stripe_payment_intent_id_key
  on public.vendor_suborders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index vendor_suborders_delivery_payment_intent_id_idx
  on public.vendor_suborders (delivery_payment_intent_id)
  where delivery_payment_intent_id is not null;

-- Platform Customer that holds the customer's saved card. The card is cloned
-- from here onto each cook's account for the food charge.
alter table public.profiles
  add column stripe_customer_id text;

create unique index profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Only server-side code (service role) may set these. Cooks can UPDATE their
-- own suborders (vendor_suborders_update_cook_or_admin) and customers can
-- UPDATE their own profile (profiles_update_own_or_admin), so without this a
-- cook could repoint a refund at another account, or a customer could point
-- their profile at someone else's saved card.

create or replace function public.guard_suborder_payment_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.charge_model is distinct from old.charge_model
     or new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_application_fee_id is distinct from old.stripe_application_fee_id
     or new.delivery_payment_intent_id is distinct from old.delivery_payment_intent_id then
    raise exception 'Payment columns on vendor_suborders can only be set by the server';
  end if;
  return new;
end;
$$;

create trigger guard_suborder_payment_columns before update on public.vendor_suborders
  for each row execute function public.guard_suborder_payment_columns();

create or replace function public.guard_profile_stripe_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and auth.role() <> 'service_role' then
    raise exception 'profiles.stripe_customer_id can only be set by the server';
  end if;
  return new;
end;
$$;

create trigger guard_profile_stripe_customer before update on public.profiles
  for each row execute function public.guard_profile_stripe_customer();
