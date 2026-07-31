-- 0024: replace the "profile_id is null means guest" cart model with
-- Supabase Anonymous Sign-Ins, closing a real RLS hole flagged by external
-- code review (see HANDOFF.md §12, item 5). carts_own_or_guest's `using
-- (profile_id = auth.uid() or profile_id is null or ...)` wasn't scoped per
-- guest at all -- it made every guest cart readable/writable by any caller,
-- not just ones who knew its ID (the migration 0006 comment's assumption
-- doesn't hold given how the policy was actually written).
--
-- Verified before this migration: the mobile app's cart code
-- (use-cart.ts/useOpenCart) always inserts/reads with a real profile_id --
-- there is currently no live UI flow that ever creates a profile_id-null
-- cart, and `session_id` (also unused by any application code) was
-- never wired into RLS. Also verified zero existing profile_id-null rows
-- on the hosted DB, so the NOT NULL below is safe to add directly.
--
-- Anonymous Sign-Ins (enabled via supabase/config.toml,
-- enable_anonymous_sign_ins = true, pushed alongside this migration) is
-- Supabase's purpose-built primitive for exactly this: a guest gets a real
-- auth.uid() from a real (if disposable) session, so `profile_id = auth.uid()`
-- works uniformly for signed-up and anonymous users alike -- no more
-- special-casing null in RLS, and no client-managed session token to smuggle
-- through requests (which wouldn't have worked cleanly for the mobile app
-- anyway -- no shared cookie jar the way a browser has). When a guest signs
-- up for a real account, the existing carts_update_own_or_admin-style
-- ownership check continues to work unchanged since it was always keyed on
-- profile_id = auth.uid(), not an identity type.

alter table public.carts drop column session_id;
alter table public.carts alter column profile_id set not null;

drop policy if exists carts_own_or_guest on public.carts;
drop policy if exists cart_items_own_or_guest on public.cart_items;

create policy carts_own on public.carts
  for all to authenticated
  using (profile_id = auth.uid() or public.is_ops_admin())
  with check (profile_id = auth.uid());

create policy cart_items_own on public.cart_items
  for all to authenticated
  using (
    exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = auth.uid())
    or public.is_ops_admin()
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = auth.uid())
  );
