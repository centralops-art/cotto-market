-- 0049: review_customer_first_name(review_id) -- narrow SECURITY DEFINER
-- lookup, same pattern as suborder_customer_display_name (0031) /
-- pool_suborder_customer_first_name (0035) / suborder_driver_display_name
-- (0041). Reviews are publicly viewable (reviews_select is "to public",
-- migration 0010) but profiles_select_own_or_admin only lets a profile read
-- its own row -- without this, a review's byline would always render blank
-- for anyone but the reviewer themselves. Grants to anon too, since
-- reviews_select allows unauthenticated viewing.
create or replace function public.review_customer_first_name(review_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select split_part(p.full_name, ' ', 1)
  from public.reviews r
  join public.profiles p on p.id = r.customer_profile_id
  where r.id = review_id
    and (r.is_flagged = false or public.is_ops_admin() or r.customer_profile_id = auth.uid() or public.owns_vendor(r.vendor_id));
$$;

grant execute on function public.review_customer_first_name(uuid) to anon, authenticated;
