import { calculateMastery } from '../domain/masteryCalculation.js';
import { nextRetentionCheck } from '../domain/retentionScheduling.js';
import type { MasteryResult } from '../domain/types.js';
import { EvidenceRepository } from '../repositories/EvidenceRepository.js';
import { MasteryStateRepository } from '../repositories/MasteryStateRepository.js';
import { withTransaction } from '../repositories/db.js';
import { getPool } from '../repositories/db.js';

export class MasteryService {
  constructor(
    private evidenceRepo = new EvidenceRepository(),
    private stateRepo = new MasteryStateRepository()
  ) {}

  /**
   * PHASE 50: called after a meaningful evidence-changing event, never on a
   * timer sweeping the whole graph. PHASE 71: locks the (student, skill)
   * state row so two concurrent submissions can't race each other's
   * recalculation.
   */
  async recalculate(studentId: string, skillId: string): Promise<MasteryResult> {
    return withTransaction(async (client) => {
      await this.stateRepo.lockOrCreate(studentId, skillId, client);

      const [evidence, previous] = await Promise.all([
        this.evidenceRepo.listForSkill(studentId, skillId, client),
        this.stateRepo.getState(studentId, skillId, client),
      ]);

      const result = calculateMastery(evidence);
      await this.stateRepo.upsertState(studentId, skillId, result, client);

      if (!previous || previous.masteryState !== result.state) {
        await this.stateRepo.insertHistory(
          studentId,
          skillId,
          previous?.masteryState ?? null,
          result.state,
          previous?.confidence ?? null,
          result.confidence,
          result.reasons.join(' '),
          client
        );
      }

      // PHASE 13: entering STRONG/MASTERED for the first time (or re-entering
      // after a stale reverification) schedules the next retention check.
      const justQualified = (result.state === 'STRONG' || result.state === 'MASTERED') && previous?.masteryState !== result.state;
      if (justQualified) {
        const step = previous?.retentionStep ?? 0;
        const schedule = nextRetentionCheck(new Date(), step);
        await client.query(
          `update retention_schedule set status = 'CANCELLED' where student_id = $1 and skill_id = $2 and status = 'PENDING'`,
          [studentId, skillId]
        );
        await client.query(
          `insert into retention_schedule (student_id, skill_id, scheduled_for, step) values ($1, $2, $3, $4)`,
          [studentId, skillId, schedule.scheduledFor, schedule.step]
        );
      }

      return result;
    });
  }

  async getState(studentId: string, skillId: string) {
    return this.stateRepo.getState(studentId, skillId);
  }
}

// Re-exported for convenience in the API layer.
export { getPool };
