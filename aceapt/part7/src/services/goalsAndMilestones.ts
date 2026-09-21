import { GoalRepo, MilestoneRepo } from '../db/repositories';
import { GoalType, Milestone, StudentGoal, StudentId } from '../types';

// ============================================================================
// GoalService — §19 GOAL ALIGNMENT
// ============================================================================
export class GoalService {
  static list(studentId: StudentId): StudentGoal[] {
    return GoalRepo.find((g) => g.student_id === studentId);
  }

  static active(studentId: StudentId): StudentGoal[] {
    return GoalRepo.find((g) => g.student_id === studentId && g.status === 'ACTIVE');
  }

  static setGoal(studentId: StudentId, goalType: GoalType, target?: number, deadline?: string): StudentGoal {
    // Only one active goal of a given type at a time — supersede rather than duplicate.
    const existing = GoalRepo.find((g) => g.student_id === studentId && g.goal_type === goalType && g.status === 'ACTIVE');
    for (const g of existing) GoalRepo.update(g.id, { status: 'EXPIRED' });

    return GoalRepo.insert({
      student_id: studentId,
      goal_type: goalType,
      target,
      deadline,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });
  }
}

// ============================================================================
// MilestoneService — §16 WEAKNESS RECOVERY + §22 MILESTONE SYSTEM
// Milestones require sustained evidence (repeated progress updates), not a
// single good session, before flipping to COMPLETE — see updateProgress.
// ============================================================================
export class MilestoneService {
  static list(studentId: StudentId): Milestone[] {
    return MilestoneRepo.find((m) => m.student_id === studentId).sort((a, b) => a.order - b.order);
  }

  static seedDefault(studentId: StudentId, objectives: Omit<Milestone, 'id' | 'student_id' | 'status' | 'order'>[]) {
    objectives.forEach((o, i) =>
      MilestoneRepo.insert({
        ...o,
        student_id: studentId,
        status: i === 0 ? 'IN_PROGRESS' : 'PENDING',
        order: i,
      })
    );
  }

  /** Called after an action completes, keyed by target_skill (§16, §22). */
  static updateProgressForSkill(studentId: StudentId, targetSkill: string, progress: number) {
    const milestone = MilestoneRepo.findOne((m) => m.student_id === studentId && m.target_skill === targetSkill);
    if (!milestone) return undefined;
    return MilestoneService.applyProgress(milestone, progress);
  }

  /** Called whenever a new overall-readiness snapshot lands (§20 readiness target). */
  static updateReadinessMilestone(studentId: StudentId, readiness: number) {
    const milestone = MilestoneRepo.findOne((m) => m.student_id === studentId && !m.target_skill);
    if (!milestone) return undefined;
    return MilestoneService.applyProgress(milestone, readiness);
  }

  private static applyProgress(milestone: Milestone, progress: number) {
    const status: Milestone['status'] = progress >= milestone.target ? 'COMPLETE' : progress > 0 ? 'IN_PROGRESS' : milestone.status;
    const updated = MilestoneRepo.update(milestone.id, {
      progress,
      status,
      completed_at: status === 'COMPLETE' ? new Date().toISOString() : undefined,
    });

    // Advance the next pending milestone into IN_PROGRESS once this one clears.
    if (status === 'COMPLETE') {
      const next = MilestoneRepo.find((m) => m.student_id === milestone.student_id && m.status === 'PENDING').sort(
        (a, b) => a.order - b.order
      )[0];
      if (next) MilestoneRepo.update(next.id, { status: 'IN_PROGRESS' });
    }

    return updated;
  }
}
