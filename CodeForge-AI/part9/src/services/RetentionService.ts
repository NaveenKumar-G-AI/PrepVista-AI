import { getPool } from '../repositories/db.js';

export interface DueRetentionCheck {
  studentId: string;
  skillId: string;
  scheduledFor: string;
  step: number;
}

export class RetentionService {
  /**
   * PHASE 29: intended to be polled by the practice-selection flow (not
   * necessarily surfaced to the student as "this is a retention test" —
   * that's a product/UX decision made by the caller).
   */
  async getDueChecks(studentId: string, limit = 10): Promise<DueRetentionCheck[]> {
    const pool = getPool();
    const { rows } = await pool.query(
      `select student_id, skill_id, scheduled_for, step from retention_schedule
       where student_id = $1 and status = 'PENDING' and scheduled_for <= now()
       order by scheduled_for asc limit $2`,
      [studentId, limit]
    );
    return rows.map((r) => ({ studentId: r.student_id, skillId: r.skill_id, scheduledFor: r.scheduled_for, step: r.step }));
  }

  async markCompleted(studentId: string, skillId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `update retention_schedule set status = 'COMPLETED', completed_at = now()
       where student_id = $1 and skill_id = $2 and status = 'PENDING'`,
      [studentId, skillId]
    );
  }
}
