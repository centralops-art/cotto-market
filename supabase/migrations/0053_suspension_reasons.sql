-- 0053: Phase 11. Suspension reason columns for vendors and profiles, mirroring
-- vendors.rejected_reason (0002) so an admin's reason for suspending an
-- active vendor or a customer is visible on the record, not just buried in
-- audit_log. Cleared on reactivation, same lifecycle as rejected_reason
-- being cleared on approval.

alter table public.vendors add column suspended_reason text;
alter table public.profiles add column suspended_reason text;
