-- 0019: explicit SMS consent, added after the A2P 10DLC campaign registration
-- (Twilio brand BN132584c12e49bccca8a976efb3f4308a) was rejected (error 30909)
-- for describing a signup opt-in checkbox that didn't actually exist in the
-- app. Phase 6 originally sent SMS automatically with no opt-in gate; this
-- migration walks that back so the app matches what's registered with Twilio.

alter table public.profiles
  add column sms_opt_in boolean not null default false;
