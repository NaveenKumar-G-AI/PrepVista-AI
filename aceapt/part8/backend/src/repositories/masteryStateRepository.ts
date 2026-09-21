import type { PoolClient } from "pg";
import type { MasteryState, MasteryStateEnum, ConfidenceLevel } from "../types/index.js";

function mapRow(r: any): MasteryState {
  return {
    id: r.id,
    studentId: r.student_id,
    skillId: r.skill_id,
    state: r.state,
    confidence: r.confidence,
    conceptScore: r.concept_score === null ? null : Number(r.concept_score),
    executionScore: r.execution_score === null ? null : Number(r.execution_score),
    transferScore: r.transfer_score === null ? null : Number(r.transfer_score),
    retentionScore: r.retention_score === null ? null : Number(r.retention_score),
    timedScore: r.timed_score === null ? null : Number(r.timed_score),
    consistencyScore: r.consistency_score === null ? null : Number(r.consistency_score),
    verifiedSnapshot: r.verified_snapshot,
    lastVerifiedAt: r.last_verified_at,
    nextReviewAt: r.next_review_at,
    masteryModelVersion: r.mastery_model_version,
    updatedAt: r.updated_at,
  };
}

export async function getMasteryState(client: PoolClient, studentId: string, skillId: string): Promise<MasteryState | null> {
  const { rows } = await client.query(
    `SELECT * FROM mastery_state WHERE student_id = $1 AND skill_id = $2`,
    [studentId, skillId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listMasteryStatesForStudent(client: PoolClient, studentId: string): Promise<MasteryState[]> {
  const { rows } = await client.query(`SELECT * FROM mastery_state WHERE student_id = $1`, [studentId]);
  return rows.map(mapRow);
}

export interface UpsertMasteryStateInput {
  id: string;
  studentId: string;
  skillId: string;
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  conceptScore: number | null;
  executionScore: number | null;
  transferScore: number | null;
  retentionScore: number | null;
  timedScore: number | null;
  consistencyScore: number | null;
  verifiedSnapshot?: Record<string, unknown> | null;
  lastVerifiedAt?: string | null;
  nextReviewAt?: string | null;
  masteryModelVersion: string;
}

export async function upsertMasteryState(client: PoolClient, input: UpsertMasteryStateInput): Promise<MasteryState> {
  const { rows } = await client.query(
    `INSERT INTO mastery_state
       (id, student_id, skill_id, state, confidence, concept_score, execution_score,
        transfer_score, retention_score, timed_score, consistency_score,
        verified_snapshot, last_verified_at, next_review_at, mastery_model_version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
     ON CONFLICT (student_id, skill_id) DO UPDATE SET
       state = EXCLUDED.state,
       confidence = EXCLUDED.confidence,
       concept_score = EXCLUDED.concept_score,
       execution_score = EXCLUDED.execution_score,
       transfer_score = EXCLUDED.transfer_score,
       retention_score = EXCLUDED.retention_score,
       timed_score = EXCLUDED.timed_score,
       consistency_score = EXCLUDED.consistency_score,
       verified_snapshot = COALESCE(EXCLUDED.verified_snapshot, mastery_state.verified_snapshot),
       last_verified_at = COALESCE(EXCLUDED.last_verified_at, mastery_state.last_verified_at),
       next_review_at = EXCLUDED.next_review_at,
       mastery_model_version = EXCLUDED.mastery_model_version,
       updated_at = now()
     RETURNING *`,
    [
      input.id,
      input.studentId,
      input.skillId,
      input.state,
      input.confidence,
      input.conceptScore,
      input.executionScore,
      input.transferScore,
      input.retentionScore,
      input.timedScore,
      input.consistencyScore,
      input.verifiedSnapshot ? JSON.stringify(input.verifiedSnapshot) : null,
      input.lastVerifiedAt ?? null,
      input.nextReviewAt ?? null,
      input.masteryModelVersion,
    ]
  );
  return mapRow(rows[0]);
}
