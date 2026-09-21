import { PoolClient } from 'pg';
import { AssessmentStatus, VALID_TRANSITIONS, appError } from '../types';
import { logEvent } from './eventService';

export async function getAssessment(client: PoolClient, assessmentId: string) {
  const { rows } = await client.query(`SELECT * FROM assessments WHERE id = $1`, [assessmentId]);
  if (rows.length === 0) {
    throw appError('ASSESSMENT_NOT_FOUND', 'Assessment not found or not accessible', 404);
  }
  return rows[0];
}

/**
 * Reads the assessment and, if it's STARTED/IN_PROGRESS/PAUSED and past its
 * server-side expires_at, transitions it to EXPIRED first. Section 17: the
 * SERVER decides whether an assessment is active — never the client's
 * clock. Every other function in this file (and submissionService) reads
 * through here, never through getAssessment() directly.
 */
export async function getAssessmentWithAutoExpire(client: PoolClient, assessmentId: string) {
  let assessment = await getAssessment(client, assessmentId);
  if (
    ['started', 'in_progress', 'paused'].includes(assessment.status) &&
    assessment.expires_at &&
    new Date(assessment.expires_at) <= new Date()
  ) {
    const { rows } = await client.query(
      `UPDATE assessments SET status = 'expired' WHERE id = $1 AND status = ANY($2::assessment_status[]) RETURNING *`,
      [assessmentId, ['started', 'in_progress', 'paused']]
    );
    if (rows.length > 0) {
      assessment = rows[0];
      await logEvent(client, assessmentId, 'ASSESSMENT_EXPIRED', { expires_at: assessment.expires_at });
    } else {
      assessment = await getAssessment(client, assessmentId); // lost the race to a concurrent expirer — reread
    }
  }
  return assessment;
}

/** Idempotent (section 62): calling start on an already-started assessment just returns it rather than erroring. */
export async function startAssessment(client: PoolClient, assessmentId: string) {
  const assessment = await getAssessmentWithAutoExpire(client, assessmentId);
  if (['started', 'in_progress'].includes(assessment.status)) return assessment;
  if (!VALID_TRANSITIONS[assessment.status as AssessmentStatus].includes('in_progress') && assessment.status !== 'created' && assessment.status !== 'ready') {
    throw appError('INVALID_STATE_TRANSITION', `Cannot start assessment in status ${assessment.status}`, 409);
  }
  const { rows } = await client.query(
    `UPDATE assessments
     SET status = 'in_progress', started_at = now(), expires_at = now() + (duration_minutes || ' minutes')::interval
     WHERE id = $1 AND status IN ('created','ready') RETURNING *`,
    [assessmentId]
  );
  if (rows.length === 0) {
    // lost a race, or status changed underneath us — reread and treat as idempotent if it's now active
    const current = await getAssessmentWithAutoExpire(client, assessmentId);
    if (['started', 'in_progress'].includes(current.status)) return current;
    throw appError('INVALID_STATE_TRANSITION', `Cannot start assessment in status ${current.status}`, 409);
  }
  await logEvent(client, assessmentId, 'ASSESSMENT_STARTED', { expires_at: rows[0].expires_at, duration_minutes: rows[0].duration_minutes });
  return rows[0];
}

export async function cancelAssessment(client: PoolClient, assessmentId: string) {
  const assessment = await getAssessmentWithAutoExpire(client, assessmentId);
  if (!VALID_TRANSITIONS[assessment.status as AssessmentStatus].includes('cancelled')) {
    throw appError('INVALID_STATE_TRANSITION', `Cannot cancel assessment in status ${assessment.status}`, 409);
  }
  const { rows } = await client.query(`UPDATE assessments SET status='cancelled' WHERE id=$1 RETURNING *`, [assessmentId]);
  await logEvent(client, assessmentId, 'ASSESSMENT_CANCELLED', {});
  return rows[0];
}

/**
 * Completion rule (section 43): once every assessment_challenge has a final
 * submission row, the assessment moves IN_PROGRESS -> SUBMITTED. Returns the
 * updated row only when that transition actually happened this call, so
 * callers know whether to trigger finalization.
 */
export async function markSubmittedIfComplete(client: PoolClient, assessmentId: string) {
  const {
    rows: [{ remaining }],
  } = await client.query(
    `SELECT COUNT(*)::int AS remaining FROM assessment_challenges ac
     WHERE ac.assessment_id = $1 AND NOT EXISTS (
       SELECT 1 FROM assessment_submissions s WHERE s.assessment_challenge_id = ac.id
     )`,
    [assessmentId]
  );
  if (remaining === 0) {
    const { rows } = await client.query(
      `UPDATE assessments SET status='submitted', submitted_at=now() WHERE id=$1 AND status='in_progress' RETURNING *`,
      [assessmentId]
    );
    if (rows.length > 0) {
      await logEvent(client, assessmentId, 'ASSESSMENT_SUBMITTED', { reason: 'all_challenges_submitted' });
      return rows[0];
    }
  }
  return null;
}
