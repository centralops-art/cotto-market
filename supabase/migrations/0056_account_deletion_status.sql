-- 0056: Phase 12. 'deleted' added to profile_status (0050) for self-service
-- account deletion (App Store Review Guideline 5.1.1(v) / Play Store's
-- equivalent requirement -- apps that support account creation must also
-- support in-app account deletion). Distinct from 'suspended': suspension is
-- admin-initiated and reversible, deletion is customer-initiated.
--
-- Deliberately NOT a hard delete: orders.customer_profile_id is `on delete
-- restrict` (0006), and this project's financial/dispute/tax history has to
-- survive the account that placed it -- confirmed with the founder. The
-- actual deletion work (status flip, PII scrub, auth ban + global sign-out)
-- happens in the new delete-own-account edge function, service-role, same
-- reason every other privileged write in this project goes through an edge
-- function or SECURITY DEFINER RPC rather than a raw client update.

alter type public.profile_status add value if not exists 'deleted';
