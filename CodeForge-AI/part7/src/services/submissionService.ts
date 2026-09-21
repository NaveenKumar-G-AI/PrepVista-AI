import { PoolClient } from 'pg';
import { appError, SupportedLanguage } from '../types';
import { runSubmission } from '../execution/executionEngine';
import { getAssessmentWithAutoExpire, markSubmittedIfComplete } from './sessionService';
import { logEvent } from './eventService';
import { withAdmin } from '../db';
import { logger } from '../observability/logger';

export interface SubmitCodeInput {
  assessmentId: string;
  studentId: string;
  assessmentChallengeId: string;
  language: SupportedLanguage;
  code: string;
  idempotencyKey: string;
}

export async function submitCode(client: PoolClient, input: SubmitCodeInput) {
  const assessment = await getAssessmentWithAutoExpire(client, input.assessmentId);

  // Defense in depth: ownership is ALSO enforced by RLS on every table touched
  // below, but we check explicitly here too so the API can return a clean
  // 403/409 instead of a confusing empty-result silence (section 54).
  if (assessment.student_id !== input.studentId) {
    throw appError('UNAUTHORIZED_ACCESS', 'This assessment does not belong to you', 403);
  }
  if (assessment.status !== 'in_progress') {
    if (assessment.status === 'expired') {
      throw appError('ASSESSMENT_EXPIRED', 'Assessment time has expired; submission rejected', 409);
    }
    throw appError('SUBMISSION_NOT_ALLOWED', `Cannot submit while assessment status is ${assessment.status}`, 409);
  }

  // Idempotency (sections 44, 62): a retried request with the same key
  // returns the ORIGINAL result — never re-executes, never double-counts.
  const { rows: existingRows } = await client.query(
    `SELECT * FROM assessment_submissions WHERE assessment_challenge_id=$1 AND idempotency_key=$2`,
    [input.assessmentChallengeId, input.idempotencyKey]
  );
  if (existingRows.length > 0) {
    return { submission: existingRows[0], replay: true, assessmentNowSubmitted: false };
  }

  // Submission immutability (section 44): once a challenge already has a
  // (different-key) final submission, no further attempts are accepted.
  const { rows: priorRows } = await client.query(
    `SELECT id FROM assessment_submissions WHERE assessment_challenge_id=$1`,
    [input.assessmentChallengeId]
  );
  if (priorRows.length > 0) {
    throw appError('SUBMISSION_NOT_ALLOWED', 'This challenge has already been submitted for this assessment', 409);
  }

  const { rows: chRows } = await client.query(
    `SELECT ac.id, ac.challenge_id FROM assessment_challenges ac WHERE ac.id=$1 AND ac.assessment_id=$2`,
    [input.assessmentChallengeId, input.assessmentId]
  );
  if (chRows.length === 0) {
    throw appError('ASSESSMENT_NOT_FOUND', 'Challenge not part of this assessment', 404);
  }
  const challengeId = chRows[0].challenge_id;

  // hidden_tests has NO column grant for codeforge_app at all (section 23) —
  // the grading path deliberately uses the privileged pool to fetch it.
  // This is the one place in the whole request path that touches admin.
  const challengeGrading = await withAdmin(async (adminClient) => {
    const { rows } = await adminClient.query(`SELECT hidden_tests FROM challenges WHERE id=$1`, [challengeId]);
    return rows[0];
  });

  const summary = await runSubmission(input.language, input.code, challengeGrading.hidden_tests);

  const {
    rows: [{ n: hintsUsed }],
  } = await client.query(`SELECT COUNT(*)::int AS n FROM hint_usage WHERE assessment_challenge_id=$1`, [
    input.assessmentChallengeId,
  ]);

  let submission;
  try {
    // A failed INSERT aborts the rest of THIS transaction in Postgres until
    // rolled back — without a savepoint here, the re-fetch query in the
    // catch block below would itself fail with "current transaction is
    // aborted". Scoping the risky INSERT to a savepoint lets a race loser
    // roll back just that statement and keep using the same transaction.
    await client.query('SAVEPOINT before_submission_insert');
    const insertResult = await client.query(
      `INSERT INTO assessment_submissions
         (assessment_id, assessment_challenge_id, student_id, language, code, idempotency_key, status, tests_passed, tests_total, runtime_ms, hints_used_before_submit, compile_stderr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        input.assessmentId,
        input.assessmentChallengeId,
        input.studentId,
        input.language,
        input.code,
        input.idempotencyKey,
        summary.status,
        summary.tests_passed,
        summary.tests_total,
        summary.runtime_ms,
        hintsUsed,
        summary.compile_stderr ?? null,
      ]
    );
    submission = insertResult.rows[0];
  } catch (err) {
    // A genuinely concurrent duplicate can race past the idempotency SELECT
    // above and lose the UNIQUE(assessment_challenge_id, idempotency_key)
    // constraint at INSERT time (Postgres error 23505). That race is real —
    // proven in scripts/test_concurrency.ts — and the correct response to
    // losing it is the SAME graceful replay as winning the earlier check,
    // not a 500. The already-graded submission (from whichever request won)
    // is re-fetched and returned as-is; nothing here re-executes.
    if ((err as { code?: string }).code === '23505') {
      await client.query('ROLLBACK TO SAVEPOINT before_submission_insert');
      const { rows: raceWinner } = await client.query(
        `SELECT * FROM assessment_submissions WHERE assessment_challenge_id=$1 AND idempotency_key=$2`,
        [input.assessmentChallengeId, input.idempotencyKey]
      );
      if (raceWinner.length > 0) {
        return { submission: raceWinner[0], replay: true, assessmentNowSubmitted: false };
      }
    }
    throw err;
  }

  for (const r of summary.results) {
    await client.query(
      `INSERT INTO submission_test_results (submission_id, test_index, passed, expected_output, actual_output, stderr, runtime_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [submission.id, r.test_index, r.passed, r.expected_output, r.actual_output, r.stderr, r.runtime_ms]
    );
  }

  await logEvent(client, input.assessmentId, 'SUBMISSION_CREATED', { assessment_challenge_id: input.assessmentChallengeId });
  await logEvent(client, input.assessmentId, 'SUBMISSION_EVALUATED', {
    submission_id: submission.id,
    status: summary.status,
    tests_passed: summary.tests_passed,
    tests_total: summary.tests_total,
  });

  const updatedAssessment = await markSubmittedIfComplete(client, input.assessmentId);

  logger.info('submission_graded', {
    assessmentId: input.assessmentId,
    assessmentChallengeId: input.assessmentChallengeId,
    language: input.language,
    status: summary.status,
    testsPassed: summary.tests_passed,
    testsTotal: summary.tests_total,
    // deliberately NOT logging input.code — section 60: don't log sensitive student data unnecessarily
  });

  return { submission, replay: false, assessmentNowSubmitted: !!updatedAssessment };
}

export async function requestHint(
  client: PoolClient,
  assessmentId: string,
  studentId: string,
  assessmentChallengeId: string,
  hintLevel: number
) {
  const assessment = await getAssessmentWithAutoExpire(client, assessmentId);
  if (assessment.student_id !== studentId) throw appError('UNAUTHORIZED_ACCESS', 'Not your assessment', 403);
  if (assessment.assistance_level === 'none') {
    throw appError('SUBMISSION_NOT_ALLOWED', 'Hints are disabled for this assessment (assistance_level=none)', 403);
  }
  await client.query(`INSERT INTO hint_usage (assessment_challenge_id, hint_level) VALUES ($1,$2)`, [
    assessmentChallengeId,
    hintLevel,
  ]);
  await logEvent(client, assessmentId, 'HINT_REQUESTED', { assessment_challenge_id: assessmentChallengeId, hint_level: hintLevel });
}
