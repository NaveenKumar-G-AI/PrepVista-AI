import { PoolClient } from 'pg';
import { pool, withRequestContext } from '../db/pool';
import { AlignmentResult, AlignmentSnapshot, StudentTargetRecord, WhatIfResult } from '../domain/types';

export async function saveAlignmentResult(client: PoolClient, result: AlignmentResult): Promise<void> {
  await client.query(
    `INSERT INTO alignment_results
       (student_id, target_id, fit_score, readiness_score, confidence, alignment_state,
        strengths, critical_gaps, supporting_gaps, next_best_action,
        insufficient_evidence_capabilities, insufficient_evidence_reason, calculated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (student_id, target_id) DO UPDATE SET
       fit_score = EXCLUDED.fit_score,
       readiness_score = EXCLUDED.readiness_score,
       confidence = EXCLUDED.confidence,
       alignment_state = EXCLUDED.alignment_state,
       strengths = EXCLUDED.strengths,
       critical_gaps = EXCLUDED.critical_gaps,
       supporting_gaps = EXCLUDED.supporting_gaps,
       next_best_action = EXCLUDED.next_best_action,
       insufficient_evidence_capabilities = EXCLUDED.insufficient_evidence_capabilities,
       insufficient_evidence_reason = EXCLUDED.insufficient_evidence_reason,
       calculated_at = EXCLUDED.calculated_at`,
    [
      result.studentId,
      result.targetId,
      result.fitScore,
      result.readinessScore,
      result.confidence,
      result.state,
      JSON.stringify(result.strengths),
      JSON.stringify(result.criticalGaps),
      JSON.stringify(result.supportingGaps),
      result.nextBestAction ? JSON.stringify(result.nextBestAction) : null,
      JSON.stringify(result.insufficientEvidenceCapabilities),
      result.insufficientEvidenceReason,
      result.calculatedAt,
    ],
  );
}

export async function saveAlignmentSnapshot(client: PoolClient, result: AlignmentResult): Promise<void> {
  await client.query(
    `INSERT INTO alignment_snapshots (student_id, target_id, fit_score, readiness_score, alignment_state, captured_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [result.studentId, result.targetId, result.fitScore, result.readinessScore, result.state, result.calculatedAt],
  );
}

interface AlignmentResultRow {
  student_id: string;
  target_id: string;
  fit_score: number | null;
  readiness_score: number | null;
  confidence: AlignmentResult['confidence'];
  alignment_state: AlignmentResult['state'];
  strengths: AlignmentResult['strengths'];
  critical_gaps: AlignmentResult['criticalGaps'];
  supporting_gaps: AlignmentResult['supportingGaps'];
  next_best_action: AlignmentResult['nextBestAction'];
  insufficient_evidence_capabilities: string[];
  insufficient_evidence_reason: string | null;
  calculated_at: string;
  target_name: string;
}

function rowToResult(row: AlignmentResultRow): AlignmentResult {
  return {
    studentId: row.student_id,
    targetId: row.target_id,
    targetName: row.target_name,
    calculatedAt: new Date(row.calculated_at).toISOString(),
    state: row.alignment_state,
    fitScore: row.fit_score,
    readinessScore: row.readiness_score,
    confidence: row.confidence,
    strengths: row.strengths,
    criticalGaps: row.critical_gaps,
    supportingGaps: row.supporting_gaps,
    nextBestAction: row.next_best_action,
    insufficientEvidenceCapabilities: row.insufficient_evidence_capabilities,
    insufficientEvidenceReason: row.insufficient_evidence_reason,
    explanationFacts: {
      targetName: row.target_name,
      state: row.alignment_state,
      fitScore: row.fit_score,
      readinessScore: row.readiness_score,
      confidence: row.confidence,
      topStrengths: row.strengths.slice(0, 3).map((s) => s.capabilityName),
      criticalGapNames: row.critical_gaps.slice(0, 3).map((g) => g.capabilityName),
      supportingGapNames: row.supporting_gaps.slice(0, 3).map((g) => g.capabilityName),
      nextBestActionCapability: row.next_best_action?.capabilityName ?? null,
    },
  };
}

export async function getStoredAlignmentResults(studentId: string): Promise<AlignmentResult[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'student', true)");
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    const { rows } = await client.query<AlignmentResultRow>(
      `SELECT ar.*, tp.name as target_name
       FROM alignment_results ar
       JOIN target_profiles tp ON tp.target_id = ar.target_id
       WHERE ar.student_id = $1
       ORDER BY ar.fit_score DESC NULLS LAST`,
      [studentId],
    );
    await client.query('COMMIT');
    return rows.map(rowToResult);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getAlignmentHistory(studentId: string, targetId: string): Promise<AlignmentSnapshot[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'student', true)");
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    const { rows } = await client.query(
      `SELECT student_id, target_id, fit_score, readiness_score, alignment_state, captured_at
       FROM alignment_snapshots
       WHERE student_id = $1 AND target_id = $2
       ORDER BY captured_at ASC`,
      [studentId, targetId],
    );
    await client.query('COMMIT');
    return rows.map((r) => ({
      studentId: r.student_id,
      targetId: r.target_id,
      fitScore: r.fit_score,
      readinessScore: r.readiness_score,
      state: r.alignment_state,
      capturedAt: new Date(r.captured_at).toISOString(),
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function recordStudentTarget(record: StudentTargetRecord): Promise<void> {
  await withRequestContext({ studentId: record.studentId, role: 'service' }, (client) =>
    client.query(
      `INSERT INTO student_targets (student_id, target_id, selected_at, previous_target_id, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.studentId, record.targetId, record.selectedAt, record.previousTargetId, record.reason],
    ),
  );
}

export async function saveAlignmentScenario(result: WhatIfResult): Promise<void> {
  await withRequestContext({ studentId: result.studentId, role: 'service' }, (client) =>
    client.query(
      `INSERT INTO alignment_scenarios
         (student_id, target_id, capability_id, current_level, projected_level,
          projected_fit_score, projected_readiness_score, projection_reliable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        result.studentId,
        result.targetId,
        result.capabilityId,
        result.currentLevel,
        result.projectedLevel,
        result.projectedFitScore,
        result.projectedReadinessScore,
        result.projectionReliable,
      ],
    ),
  );
}
