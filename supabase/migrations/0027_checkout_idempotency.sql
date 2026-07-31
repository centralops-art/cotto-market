-- 0027: at most one in-flight (pending_payment) order per cart. Nothing
-- previously stopped a double-tap on "checkout" or a network retry from
-- calling checkout-create-payment-intent twice for the same still-open cart
-- (carts.status only flips to 'checked_out' once payment actually succeeds,
-- via stripe-webhook -- an abandoned checkout leaves the cart 'open'
-- indefinitely), each creating a brand-new order + vendor_suborders +
-- PaymentIntent. This is the DB-level backstop for true concurrent
-- duplicates; checkout-create-payment-intent (next deploy) also proactively
-- cancels any existing pending order for the cart before creating a fresh
-- one, so a genuinely changed cart (items added/removed since the first
-- abandoned attempt) never gets charged against a stale amount.
--
-- Standard SQL NULL semantics mean this doesn't need an explicit
-- `cart_id is not null` clause -- a unique index never treats two NULLs as
-- colliding, partial or not.

create unique index orders_cart_id_pending_unique on public.orders (cart_id) where status = 'pending_payment';
