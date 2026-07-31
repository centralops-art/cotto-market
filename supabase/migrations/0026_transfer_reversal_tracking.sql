-- 0026: track vendor Transfer reversals directly on vendor_suborders,
-- mirroring how stripe_transfer_id itself is already a first-class column
-- rather than something only findable by parsing audit_log. Supports the
-- refund policy decided in HANDOFF.md §12 item 8: a full refund reverses
-- each affected suborder's vendor Transfer (protected in practice by the
-- 2-day Connect payout hold set in stripe-connect-onboarding, migration-adjacent).

alter table public.vendor_suborders
  add column stripe_transfer_reversal_id text;
