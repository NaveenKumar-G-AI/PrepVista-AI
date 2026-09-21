import { PoolClient } from 'pg';

export async function listAssessmentsForCurrentUser(client: PoolClient, studentId: string) {
  const { rows } = await client.query(
    `SELECT id, assessment_type, purpose, status, duration_minutes, started_at, expires_at, created_at
     FROM assessments WHERE student_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [studentId]
  );
  return rows;
}

/**
 * Challenge detail for the workspace UI. Selects only columns codeforge_app
 * actually has a grant on (see db/migrations/003) — hidden_tests is never
 * requested here, so there's no risk of leaking it even by mistake.
 */
export async function getAssessmentChallenges(client: PoolClient, assessmentId: string) {
  const { rows } = await client.query(
    `SELECT ac.id, ac.sequence_order, ac.is_unseen, ac.is_transfer_probe, sk.name AS skill_name,
            c.title, c.statement, c.starter_code, c.public_examples, c.language,
            s.id AS submission_id, s.status AS submission_status, s.tests_passed, s.tests_total
     FROM assessment_challenges ac
     JOIN skills sk ON sk.id = ac.skill_id
     JOIN challenges c ON c.id = ac.challenge_id
     LEFT JOIN assessment_submissions s ON s.assessment_challenge_id = ac.id
     WHERE ac.assessment_id = $1
     ORDER BY ac.sequence_order`,
    [assessmentId]
  );
  return rows;
}

/** Per-test pass/fail feedback for a submission the caller already owns (RLS-checked via the submission_id join). Appropriate post-submission feedback, not a hidden-test leak (section 23) — only ever shown for the student's own already-final submission. */
export async function getSubmissionTestResults(client: PoolClient, submissionId: string) {
  const { rows } = await client.query(
    `SELECT test_index, passed, expected_output, actual_output, stderr
     FROM submission_test_results WHERE submission_id = $1 ORDER BY test_index`,
    [submissionId]
  );
  return rows;
}
