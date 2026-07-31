-- 0020: bundle SMS consent into the mandatory signup checkbox (Terms &
-- Conditions + Privacy Policy + "consent to receive order and delivery SMS
-- notifications"), per the corrected A2P 10DLC campaign resubmission
-- guidance. Superseding migration 0019's standalone post-signup opt-in
-- checkbox (complete-profile.tsx) -- that flow asked separately from ToS
-- acceptance, which is exactly the kind of un-registered consent path that
-- got the campaign rejected the first time. handle_new_user() now seeds
-- sms_opt_in from signup metadata the same way it already seeds full_name;
-- profiles.sms_opt_in itself (added in 0019) still gates the SMS send and
-- is still user-revocable via the toggle in account.tsx.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, sms_opt_in)
  values (new.id, new.raw_user_meta_data ->> 'full_name', coalesce((new.raw_user_meta_data ->> 'sms_opt_in')::boolean, false));
  return new;
end;
$$;
