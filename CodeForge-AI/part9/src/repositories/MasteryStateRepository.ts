import type { PoolClient } from 'pg';
import type { MasteryResult } from '../domain/types.js';
import type { MasteryState } from '../domain/config.js';
import { getPool } from './db.js';

export interface StoredState {
  masteryState: MasteryState;
  confidence: number;
  lastVerifiedAt: string | null;
  lastEvidenceAt: string | null;
  retentionStep: number;
}

export class MasteryStateRepository {
  async getState(studentId: string, skillId: string, client?: PoolClient): Promise<StoredState | null> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select mastery_state, confidence, last_verified_at, last_evidence_at, retention_step
       from student_skill_state where student_id = $1 and skill_id = $2`,
      [studentId, skillId]
    );
    if (!rows[0]) return null;
    return {
      masteryState: rows[0].mastery_state,
      confidence: Number(rows[0].confidence),
      lastVerifiedAt: rows[0].last_verified_at,
      lastEvidenceAt: rows[0].last_evidence_at,
      retentionStep: rows[0].retention_step,
    };
  }

  async listAllStatesForStudent(studentId: string, client?: PoolClient): Promise<Map<string, StoredState>> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select skill_id, mastery_state, confidence, last_verified_at, last_evidence_at, retention_step
       from student_skill_state where student_id = $1`,
      [studentId]
    );
    const map = new Map<string, StoredState>();
    for (const r of rows) {
      map.set(r.skill_id, {
        masteryState: r.mastery_state,
        confidence: Number(r.confidence),
        lastVerifiedAt: r.last_verified_at,
        lastEvidenceAt: r.last_evidence_at,
        retentionStep: r.retention_step,
      });
    }
    return map;
  }

  /** PHASE 71: locks the row (creating it first if absent) so concurrent recalculations for the same skill serialize. */
  async lockOrCreate(studentId: string, skillId: string, client: PoolClient): Promise<void> {
    await client.query(
      `insert into student_skill_state (student_id, skill_id) values ($1, $2)
       on conflict (student_id, skill_id) do nothing`,
      [studentId, skillId]
    );
    await client.query(`select 1 from student_skill_state where student_id = $1 and skill_id = $2 for update`, [studentId, skillId]);
  }

  async upsertState(studentId: string, skillId: string, result: MasteryResult, client?: PoolClient): Promise<void> {
    const db = client ?? getPool();
    await db.query(
      `insert into student_skill_state (student_id, skill_id, mastery_state, confidence, raw_score, last_verified_at, last_evidence_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6, now())
       on conflict (student_id, skill_id) do update set
         mastery_state = excluded.mastery_state,
         confidence = excluded.confidence,
         raw_score = excluded.raw_score,
         last_verified_at = excluded.last_verified_at,
         last_evidence_at = excluded.last_evidence_at,
         updated_at = now()`,
      [studentId, skillId, result.state, result.confidence, result.rawScore, result.lastQualifyingEvidenceAt]
    );
  }

  async insertHistory(
    studentId: string,
    skillId: string,
    previousState: string | null,
    newState: string,
    previousConfidence: number | null,
    newConfidence: number,
    reason: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client ?? getPool();
    await db.query(
      `insert into skill_state_history (student_id, skill_id, previous_state, new_state, previous_confidence, new_confidence, reason)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [studentId, skillId, previousState, newState, previousConfidence, newConfidence, reason]
    );
  }
}
