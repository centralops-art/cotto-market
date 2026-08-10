-- 0047: two narrow SECURITY DEFINER RPCs for Phase 10, same idiom as every
-- prior phase's write paths that don't get a raw client-facing RLS grant.

-- report_review: any authenticated profile can flag someone else's review
-- for moderation. Deliberately not restricted to "not the review's own
-- author" -- reviews_update_own_or_admin (migration 0010) already lets an
-- author edit/unflag their own row directly, so a self-report is harmless
-- and not worth a special-cased rejection. Keeps the reviews table itself
-- as the only moderation state (no separate review_reports table) per the
-- spec's "lightweight" framing -- a second report just overwrites
-- flagged_reason with the latest reporter's text, which is fine for a
-- single-admin-reviewed queue.
create or replace function public.report_review(review_id uuid, reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.reviews
  set is_flagged = true, flagged_reason = reason
  where id = review_id;

  if not found then
    raise exception 'Review not found';
  end if;
end;
$$;

grant execute on function public.report_review(uuid, text) to authenticated;

-- rate_delivery_claim: the customer's driver rating (spec 3.4 item 9).
-- delivery_claims has zero client-facing UPDATE grant (migration 0010's
-- comment on that section explicitly reserved this for Phase 10), so this
-- is the only path to setting customer_rating/customer_rating_comment.
-- One-time by design (confirmed with the founder before building) --
-- `where customer_rating is null` makes a second call a no-op that reports
-- back as already-rated rather than silently overwriting an earlier rating.
create or replace function public.rate_delivery_claim(so_id uuid, rating smallint, comment text default null)
returns public.delivery_claims
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.delivery_claims;
begin
  if rating is null or rating < 1 or rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if not exists (
    select 1
    from public.vendor_suborders so
    join public.orders o on o.id = so.order_id
    where so.id = so_id
      and o.customer_profile_id = auth.uid()
      and so.status = 'completed'
      and so.fulfillment = 'delivery'
  ) then
    raise exception 'You can only rate a completed delivery you ordered';
  end if;

  -- The most recently claimed row is the one that actually completed the
  -- delivery -- a released-and-reclaimed suborder leaves earlier claims
  -- behind with released_at set, same reasoning as claim_delivery's
  -- delivery_cycle handling.
  select dc.* into v_claim
  from public.delivery_claims dc
  where dc.vendor_suborder_id = so_id
  order by dc.claimed_at desc
  limit 1;

  if v_claim.id is null then
    raise exception 'No delivery claim found for this order';
  end if;

  update public.delivery_claims
  set customer_rating = rating, customer_rating_comment = comment
  where id = v_claim.id and customer_rating is null
  returning * into v_claim;

  if v_claim.id is null then
    raise exception 'This delivery has already been rated';
  end if;

  return v_claim;
end;
$$;

grant execute on function public.rate_delivery_claim(uuid, smallint, text) to authenticated;
