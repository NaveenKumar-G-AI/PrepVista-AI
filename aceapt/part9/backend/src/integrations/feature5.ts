import { SkillId } from '../domain/types';

// ============================================================
// FEATURE 5 INTEGRATION SEAM  (spec section 39)
// ============================================================
// Feature 9 -> Feature 7 (diagnose) -> Feature 5 (train) -> Feature 8
// (verify) -> Feature 9 (simulate again). Feature 9 never executes
// training itself; it only hands off which skills need it.

export interface Feature5Client {
  triggerTrainingLoop(studentId: string, focusSkills: SkillId[]): Promise<void>;
}

export class MockFeature5Client implements Feature5Client {
  private triggers: Array<{ studentId: string; focusSkills: SkillId[] }> = [];

  async triggerTrainingLoop(studentId: string, focusSkills: SkillId[]): Promise<void> {
    this.triggers.push({ studentId, focusSkills });
  }

  getTriggers() {
    return this.triggers;
  }
}
