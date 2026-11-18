-- 0061: record collected sales tax with Stripe Tax.
--
-- checkout-create-payment-intent has always called
-- stripe.tax.calculations.create() per vendor, but a calculation is only a
-- quote -- Stripe Tax's reports and filings count a sale only once it is
-- turned into a tax TRANSACTION (tax.transactions.createFromCalculation)
-- after payment. Nothing ever did that, so Stripe would have reported $0
-- collected while customers were actually paying tax.
--
-- These columns let stripe-webhook create the transaction on
-- payment_intent.succeeded, and let the refund paths reverse it.
-- Calculations expire after 90 days, which is far longer than the gap
-- between checkout and payment.

alter table public.vendor_suborders
  add column stripe_tax_calculation_id text,
  add column stripe_tax_transaction_id text,
  add column stripe_tax_reversal_id text;
