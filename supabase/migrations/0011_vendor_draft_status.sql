-- 0011: add 'draft' to vendor_status ahead of the cook onboarding wizard
-- (Phase 2). Split into its own migration/transaction because Postgres
-- forbids using a freshly-added enum value in the same transaction it was
-- added in -- migration 0012 does the default/trigger changes that reference it.

alter type public.vendor_status add value if not exists 'draft';
