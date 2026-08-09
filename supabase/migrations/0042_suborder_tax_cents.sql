-- 0042: vendor_suborders.tax_cents (Phase 9 prerequisite)
--
-- checkout-create-payment-intent already computes a per-vendor Stripe Tax
-- amount (vendorTaxCents) for every suborder, but historically only the
-- SUM was persisted (orders.tax_cents) -- the per-suborder figure was
-- discarded after being folded into the total. Phase 9 needs to refund/
-- reverse a SINGLE suborder inside a possibly multi-vendor order (an
-- unclaimed delivery), and doing that accurately requires knowing exactly
-- how much tax was charged for that one suborder, not a guess.

alter table public.vendor_suborders
  add column tax_cents integer not null default 0 check (tax_cents >= 0);
