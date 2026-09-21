import { ReadinessRepo, ActionRepo } from '../db/repositories';
import { ScoredSignal } from './problemAndPriority';
import { StudentId } from '../types';

export interface ReadinessGap {
  current: number;
  target: number;
  gap: number;
  contributors: { skill_name: string; category: string; contribution: number }[];
  explanation: string;
}

// ============================================================================
// ReadinessGapService — §20 READINESS TARGET + §21 READINESS GAP EXPLANATION
// ============================================================================
export class ReadinessGapService {
  static currentReadiness(studentId: StudentId): number {
    const snapshots = ReadinessRepo.find((s) => s.student_id === studentId).sort(
      (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime()
    );
    return snapshots.length ? snapshots[snapshots.length - 1].readiness : 0;
  }

  static compute(studentId: StudentId, signals: ScoredSignal[], target: number): ReadinessGap {
    const current = ReadinessGapService.currentReadiness(studentId);
    const gap = Math.max(0, target - current);

    const negative = signals.filter((s) => s.problem_type !== 'STABLE_STRENGTH').slice(0, 4);
    const totalScore = negative.reduce((sum, s) => sum + s.priority_score, 0) || 1;

    const contributors = negative.map((s) => ({
      skill_name: s.skill_name,
      category: s.category,
      contribution: Math.round((s.priority_score / totalScore) * gap),
    }));

    const top = contributors[0];
    const explanation = top
      ? `Your current readiness gap is primarily caused by ${top.skill_name.toLowerCase()}, not a broad lack of preparation — closing that one gap accounts for roughly ${top.contribution} of the ${gap}-point difference.`
      : `You're within reach of your target — the remaining gap is spread thinly across a few lower-priority skills.`;

    return { current, target, gap, contributors, explanation };
  }
}

// ============================================================================
// ProgressStoryService — §27 PROGRESS STORY + §28 BEFORE/AFTER EVIDENCE
// ============================================================================
export class ProgressStoryService {
  static story(studentId: StudentId) {
    const snapshots = ReadinessRepo.find((s) => s.student_id === studentId).sort(
      (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime()
    );

    return snapshots.map((snap) => {
      const driver = snap.driver_action_id ? ActionRepo.getById(snap.driver_action_id) : undefined;
      return {
        readiness: snap.readiness,
        taken_at: snap.taken_at,
        driver_action: driver ? `${driver.action_type} — ${driver.target_skill_name}` : 'Baseline',
      };
    });
  }

  static beforeAfter(studentId: StudentId) {
    const story = ProgressStoryService.story(studentId);
    if (story.length < 2) return null;

    const before = story[0];
    const after = story[story.length - 1];

    const deltas = story.slice(1).map((s, i) => ({
      driver: s.driver_action,
      delta: s.readiness - story[i].readiness,
    }));
    const biggest = [...deltas].sort((a, b) => b.delta - a.delta)[0];

    return {
      before,
      after,
      readiness_gain: after.readiness - before.readiness,
      largest_contributor: biggest?.driver,
    };
  }
}
