-- =============================================================================
-- 007_future_gaps_unique_constraint.sql
-- BUG FOUND WHILE BUILDING: futureGap.service.ts upserts future_gaps with
-- ON CONFLICT (student_id, target_role_id, skill_id, period), but migration
-- 003 never defined that as a unique constraint -- the INSERT would have
-- thrown "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" the first time two students (or one student
-- recomputed twice) hit computeAndStoreFutureGaps. Caught by re-reading the
-- migration against the service before running either, fixed here rather
-- than papering over it with a try/catch fallback in application code.
-- =============================================================================

ALTER TABLE future_gaps
  ADD CONSTRAINT future_gaps_student_role_skill_period_unique
  UNIQUE (student_id, target_role_id, skill_id, period);
