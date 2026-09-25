-- ============================================================================
-- QuickFix AI — Fix deletes not propagating (run ONCE in the SQL Editor)
--
-- Symptom: "Delete" looks like it worked, but the row comes back after a
-- refresh and admins still see it.
--
-- Cause: the problems DELETE policy was missing (it lives in
-- migration-step-2.sql, which likely failed partway). With Row-Level
-- Security enabled but no DELETE policy, Postgres silently blocks the
-- delete: Supabase returns success but 0 rows are removed.
--
-- This script:
--   1. Creates the problems_delete policy (owner or admin may delete).
--   2. Detaches ai_requests rows whose problem was "deleted" while the
--      policy was missing (problem_id -> NULL), so admin lists stay clean.
--
-- Idempotent: safe to run again.
-- ============================================================================

-- 1) The DELETE policy on problems ------------------------------------------
drop policy if exists problems_delete on public.problems;
create policy problems_delete on public.problems
  for delete using (user_id = auth.uid() or public.is_admin());

-- 2) Cleanup of requests orphaned by the earlier blocked deletes ------------
-- (ai_requests.problem_id is ON DELETE SET NULL, so blocked-era deletes left
-- requests pointing at NULL. This has no effect on rows still linked.)
update public.ai_requests
set problem_id = null
where problem_id is not null
  and not exists (select 1 from public.problems p where p.id = ai_requests.problem_id);
