\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- =============================================================================
-- SEED DATA — as service_role (bypasses RLS by design)
-- =============================================================================
set role service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'student_a@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'student_b@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'instructor@example.test')
on conflict (id) do nothing;

insert into course_enrollments (instructor_id, student_id, role) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'instructor')
on conflict do nothing;
-- Deliberately NOT enrolling the instructor with student B — that's the
-- unauthorized-access case below.

insert into growth_evidence
  (evidence_id, student_id, dimension, source_type, source_id, outcome, source_confidence,
   assistance_level, difficulty, is_transfer, is_retention_check, challenge_family, role_context,
   occurred_at, evidence_version, context)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'debugging', 'debugging',
   '20000000-0000-0000-0000-000000000001', 'SUCCESS', 0.9, 'LOW', 'MEDIUM', false, false, 'off-by-one', null,
   now() - interval '3 days', 'seed@1', '{}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'debugging', 'debugging',
   '20000000-0000-0000-0000-000000000002', 'SUCCESS', 0.9, 'LOW', 'MEDIUM', false, false, 'off-by-one', null,
   now() - interval '3 days', 'seed@1', '{}')
on conflict do nothing;

reset role;

\echo '=== SEED COMPLETE ==='

-- =============================================================================
-- TEST 1: student A, reading as authenticated, sees ONLY their own evidence row.
-- =============================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

\echo '--- TEST 1: student A reads growth_evidence (expect exactly 1 row, student A''s own) ---'
select count(*) as visible_row_count, array_agg(distinct student_id::text) as visible_student_ids from growth_evidence;

-- =============================================================================
-- TEST 2 (ADVERSARIAL): student A explicitly tries to read student B's row
-- by student_id filter. This must return ZERO rows even though the row
-- genuinely exists — RLS, not application filtering, is what's tested here.
-- =============================================================================
\echo '--- TEST 2 (adversarial): student A explicitly filters for student B''s student_id (expect 0 rows) ---'
select count(*) as should_be_zero from growth_evidence where student_id = '00000000-0000-0000-0000-000000000002';

-- =============================================================================
-- TEST 3 (ADVERSARIAL): student A attempts to INSERT a fabricated evidence
-- row directly (simulating a compromised/malicious client bypassing the
-- API and hitting Postgres directly). Must be rejected — no INSERT policy
-- exists for `authenticated` at all.
-- =============================================================================
\echo '--- TEST 3 (adversarial): student A attempts direct INSERT of fake evidence (expect permission error) ---'
insert into growth_evidence
  (student_id, dimension, source_type, source_id, outcome, source_confidence, assistance_level,
   is_transfer, is_retention_check, occurred_at, evidence_version, context)
values
  ('00000000-0000-0000-0000-000000000001', 'correctness', 'correctness', '20000000-0000-0000-0000-000000000099',
   'SUCCESS', 1.0, 'NONE', false, false, now(), 'fake@1', '{}');

-- =============================================================================
-- TEST 4 (ADVERSARIAL): student A attempts to UPDATE their own real row
-- (simulating trying to inflate their own confidence/outcome after the
-- fact). Must be rejected by the append-only trigger even before RLS is
-- reached, and there's no UPDATE policy either.
-- =============================================================================
\echo '--- TEST 4 (adversarial): student A attempts to UPDATE their own evidence row (expect rejection) ---'
update growth_evidence set outcome = 'SUCCESS', source_confidence = 1.0
  where evidence_id = '10000000-0000-0000-0000-000000000001';

-- =============================================================================
-- TEST 5: unauthorized instructor (enrolled with A, NOT with B) reads A's
-- data fine, but gets ZERO rows for B.
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);

\echo '--- TEST 5a: instructor reads evidence for ENROLLED student A (expect 1 row) ---'
select count(*) as should_be_one from growth_evidence where student_id = '00000000-0000-0000-0000-000000000001';

\echo '--- TEST 5b (adversarial): same instructor reads evidence for UNENROLLED student B (expect 0 rows) ---'
select count(*) as should_be_zero from growth_evidence where student_id = '00000000-0000-0000-0000-000000000002';

-- =============================================================================
-- TEST 6: student B, in their own session, still sees their own row fine —
-- confirms the block above is about identity/enrollment, not a global bug.
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
\echo '--- TEST 6: student B reads their own evidence in their own session (expect 1 row) ---'
select count(*) as should_be_one from growth_evidence where student_id = '00000000-0000-0000-0000-000000000002';

reset role;
\echo '=== RLS VERIFICATION COMPLETE ==='
