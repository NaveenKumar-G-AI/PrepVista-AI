-- Run as the `postgres` superuser (owner) to seed, then the proof queries
-- below reconnect as the non-superuser `cf_app_authenticated` role to make
-- the RLS checks meaningful. See run_rls_verification.sh for the full
-- orchestration (this file alone mixes both for readability).

\echo '--- Seeding two students'' assessments as the table owner ---'

INSERT INTO correctness_assessments
  (id, submission_id, submission_version, problem_id, user_id, language, status, confidence, error_category, pass_rate, total_available, passed, failed, skipped, summary, raw)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'sub_alice_1', 'v1', 'problem_two_sum',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'python', 'PARTIALLY_VALIDATED', 'MEDIUM', 'WRONG_ANSWER',
   0.6, 10, 6, 4, 0, 'Alice: 6/10 pass', '{}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'sub_bob_1', 'v1', 'problem_two_sum',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'python', 'ACCEPTED', 'HIGH', 'NONE',
   1.0, 10, 10, 0, 0, 'Bob: 10/10 pass', '{}'::jsonb)
ON CONFLICT (submission_id, submission_version) DO NOTHING;

INSERT INTO correctness_findings (assessment_id, user_id, kind, rule_or_claim, message)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cluster', 'cluster-boundary', 'Alice boundary finding'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cluster', 'cluster-none', 'Bob has no findings, all pass');

\echo '--- Row counts as table owner (RLS bypassed by ownership+FORCE is irrelevant here; owner always sees all) ---'
SELECT count(*) AS owner_visible_assessments FROM correctness_assessments;
