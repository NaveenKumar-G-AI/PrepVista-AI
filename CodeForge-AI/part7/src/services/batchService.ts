import { PoolClient } from 'pg';
import { withUserContext, withAdmin } from '../db';
import { createAssessment } from './assessmentService';
import { AssessmentType, SupportedLanguage } from '../types';
import { logger } from '../observability/logger';

export interface CreateBatchInput {
  institutionId: string;
  roleId: string;
  blueprintName: string;
  assessmentType: AssessmentType;
  purpose: string;
  createdBy: string; // TPO app_user id
  studentIds: string[];
}

/** Records the TPO's intent — who's assigned what. Runs under the TPO's own RLS-scoped session (batch_assignments has a TPO-institution-scoped policy). */
export async function createBatchAssignment(client: PoolClient, input: CreateBatchInput) {
  const {
    rows: [batch],
  } = await client.query(
    `INSERT INTO batch_assignments (institution_id, role_id, blueprint_name, assessment_type, purpose, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.institutionId, input.roleId, input.blueprintName, input.assessmentType, input.purpose, input.createdBy]
  );
  for (const studentId of input.studentIds) {
    await client.query(`INSERT INTO batch_assignment_students (batch_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      batch.id,
      studentId,
    ]);
  }
  logger.info('batch_assignment_created', { batchId: batch.id, studentCount: input.studentIds.length });
  return batch;
}

export interface ProvisionResult {
  studentId: string;
  assessmentId?: string;
  error?: string;
}

/**
 * System-level provisioning step: for each assigned student, creates their
 * assessment under THEIR OWN RLS-scoped session — even though the batch was
 * TPO-initiated, the invariant "a student's assessment is always created in
 * that student's own context" (same as the ordinary single-assessment flow)
 * is preserved rather than special-cased for batches. One student's failure
 * (e.g. no valid challenge for their language) does not abort the batch for
 * everyone else — each is caught and recorded individually (section 61).
 * Idempotent per batch (creationIdempotencyKey), so re-running a partially-
 * failed batch only provisions the students who don't already have one.
 */
export async function provisionBatchAssessments(batchId: string, language: SupportedLanguage): Promise<ProvisionResult[]> {
  const batchRows = await withAdmin((c) => c.query(`SELECT * FROM batch_assignments WHERE id=$1`, [batchId]));
  const batch = batchRows.rows[0];
  const studentRows = await withAdmin((c) =>
    c.query(`SELECT student_id, assessment_id FROM batch_assignment_students WHERE batch_id=$1`, [batchId])
  );

  const results: ProvisionResult[] = [];
  for (const row of studentRows.rows) {
    if (row.assessment_id) {
      results.push({ studentId: row.student_id, assessmentId: row.assessment_id });
      continue;
    }
    try {
      const assessment = await withUserContext(row.student_id, 'student', (client: PoolClient) =>
        createAssessment(client, {
          studentId: row.student_id,
          roleId: batch.role_id,
          blueprintName: batch.blueprint_name,
          assessmentType: batch.assessment_type,
          purpose: batch.purpose,
          language,
          creationIdempotencyKey: `batch-${batchId}`,
        })
      );
      await withAdmin((c) =>
        c.query(`UPDATE batch_assignment_students SET assessment_id=$1 WHERE batch_id=$2 AND student_id=$3`, [
          assessment.id,
          batchId,
          row.student_id,
        ])
      );
      results.push({ studentId: row.student_id, assessmentId: assessment.id });
    } catch (err) {
      logger.error('batch_provision_failed', { batchId, studentId: row.student_id, error: String(err) });
      results.push({ studentId: row.student_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  logger.info('batch_provisioned', { batchId, total: results.length, failed: results.filter((r) => r.error).length });
  return results;
}
