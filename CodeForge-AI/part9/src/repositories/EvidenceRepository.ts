import type { PoolClient } from 'pg';
import type { SkillEvidence } from '../domain/types.js';
import { getPool } from './db.js';

function rowToEvidence(row: any): SkillEvidence {
  return {
    id: row.id,
    studentId: row.student_id,
    skillId: row.skill_id,
    problemId: row.problem_id,
    source: row.source,
    difficulty: row.difficulty,
    independent: row.independent,
    hintsUsed: row.hints_used,
    solutionViewed: row.solution_viewed,
    isTransfer: row.is_transfer,
    timed: row.timed,
    passed: row.passed,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    supersededByCorrection: row.superseded_by_correction,
  };
}

export class EvidenceRepository {
  async listForSkill(studentId: string, skillId: string, client?: PoolClient): Promise<SkillEvidence[]> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select * from student_skill_evidence where student_id = $1 and skill_id = $2 order by created_at asc`,
      [studentId, skillId]
    );
    return rows.map(rowToEvidence);
  }

  async listRecentForStudent(studentId: string, limit = 100, client?: PoolClient): Promise<SkillEvidence[]> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select * from student_skill_evidence where student_id = $1 order by created_at desc limit $2`,
      [studentId, limit]
    );
    return rows.map(rowToEvidence);
  }

  /**
   * PHASE 70 idempotency: relies on the unique index on idempotency_key.
   * A retried request with the same key is a silent no-op, not a duplicate.
   */
  async insert(
    evidence: Omit<SkillEvidence, 'id' | 'createdAt'> & { idempotencyKey?: string; suspicious?: boolean; suspiciousReason?: string },
    client?: PoolClient
  ): Promise<SkillEvidence | null> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `insert into student_skill_evidence
        (student_id, skill_id, problem_id, source, difficulty, independent, hints_used, solution_viewed,
         is_transfer, timed, passed, failure_reason, suspicious, suspicious_reason, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (idempotency_key) do nothing
       returning *`,
      [
        evidence.studentId,
        evidence.skillId,
        evidence.problemId,
        evidence.source,
        evidence.difficulty,
        evidence.independent,
        evidence.hintsUsed,
        evidence.solutionViewed,
        evidence.isTransfer,
        evidence.timed,
        evidence.passed,
        evidence.failureReason ?? null,
        evidence.suspicious ?? false,
        evidence.suspiciousReason ?? null,
        evidence.idempotencyKey ?? null,
      ]
    );
    return rows[0] ? rowToEvidence(rows[0]) : null;
  }
}
