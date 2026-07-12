-- 0016: link orders back to the cart they were checked out from, so the
-- payment webhook can flip the cart to 'checked_out' once payment succeeds
-- (kept open until then, so a failed/abandoned PaymentIntent doesn't strand
-- the customer's cart contents).

alter table public.orders
  add column cart_id uuid references public.carts (id) on delete set null;

create index orders_cart_id_idx on public.orders (cart_id);
