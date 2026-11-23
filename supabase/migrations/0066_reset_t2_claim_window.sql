-- 0066: put the North Shore Chicago T2 claim window back to 30 minutes
-- (HANDOFF.md §41). It was set to 20 during testing; founder confirmed
-- 2026-11-22 that 30 is intended. T1 (10) and T3 (60) are unchanged and
-- still satisfy 0051's T1 < T2 < T3 check.

update public.regions
set claim_window_t2_minutes = 30
where name = 'North Shore Chicago';
