import { MasteryState, SkillId } from '../domain/types';

// ============================================================
// FEATURE 8 INTEGRATION SEAM  (spec sections 36, 42)
// ============================================================
// Feature 9 must CONSUME Feature 8 evidence, never rebuild it.
// This file defines the contract Feature 9 needs from Feature 8
// (mastery-per-skill state, and question exposure counts for
// novelty/anti-memorization control) plus a small in-memory mock so
// the engine runs standalone. Replace MockFeature8Client with an
// adapter that calls your real Feature 8 service/repository - nothing
// else in this codebase needs to change as long as it implements
// Feature8Client.

export interface SkillMasteryEvidence {
  skill: SkillId;
  masteryState: MasteryState;
}

export interface Feature8Client {
  /** Current mastery/transfer/retention state per skill, per spec section 36. */
  getMasteryEvidence(studentId: string, skills: SkillId[]): Promise<SkillMasteryEvidence[]>;

  /** How many times each question has already been shown to this student. */
  getQuestionExposure(studentId: string, questionIds: string[]): Promise<Record<string, number>>;

  /** Called once a simulation starts, so future exposure checks stay accurate. */
  recordExposure(studentId: string, questionIds: string[]): Promise<void>;
}

export class MockFeature8Client implements Feature8Client {
  // studentId -> skill -> mastery state
  private mastery = new Map<string, Map<SkillId, MasteryState>>();
  // studentId -> questionId -> exposure count
  private exposure = new Map<string, Map<string, number>>();

  constructor() {
    // Seed data mirroring the worked example in spec section 36.
  }

  async getMasteryEvidence(studentId: string, skills: SkillId[]): Promise<SkillMasteryEvidence[]> {
    const studentMap = this.mastery.get(studentId) ?? this.seedDefaultMastery();
    return skills.map((skill) => ({
      skill,
      masteryState: studentMap.get(skill) ?? 'UNKNOWN',
    }));
  }

  async getQuestionExposure(studentId: string, questionIds: string[]): Promise<Record<string, number>> {
    const studentMap = this.exposure.get(studentId);
    const result: Record<string, number> = {};
    for (const id of questionIds) {
      result[id] = studentMap?.get(id) ?? 0;
    }
    return result;
  }

  async recordExposure(studentId: string, questionIds: string[]): Promise<void> {
    const studentMap = this.exposure.get(studentId) ?? new Map<string, number>();
    for (const id of questionIds) {
      studentMap.set(id, (studentMap.get(id) ?? 0) + 1);
    }
    this.exposure.set(studentId, studentMap);
  }

  private seedDefaultMastery(): Map<SkillId, MasteryState> {
    // Mirrors spec section 36's worked example so the demo report reads
    // the way the spec describes it out of the box.
    return new Map<SkillId, MasteryState>([
      ['arithmetic', 'STABLE'],
      ['probability', 'VERIFIED'],
      ['data_interpretation', 'AT_RISK'],
    ]);
  }
}
