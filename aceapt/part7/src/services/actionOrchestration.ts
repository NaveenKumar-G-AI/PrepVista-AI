import { ActionRepo } from '../db/repositories';
import { Feature6Client } from './integrations/Feature6Client';
import { ProblemDetectionService, PriorityEngine, ScoredSignal } from './problemAndPriority';
import { InterventionService, ExplanationService } from './interventionAndExplanation';
import { ActionStatus, Confidence, StudentAction, StudentId } from '../types';

export interface PrioritizedBoard {
  top: ScoredSignal[];
  secondary: ScoredSignal[];
  maintain: ScoredSignal[];
}

// ============================================================================
// NextBestActionService — §4 NEXT-BEST-ACTION ENGINE + §7 BIGGEST-WEAKNESS
// PRINCIPLE + §33 intelligence layer. The central orchestrator: evidence →
// problems → priority → intervention → one explainable action.
// ============================================================================
export class NextBestActionService {
  /** §7 — bucket every scored signal into Top / Secondary / Maintain. */
  static async board(studentId: StudentId): Promise<PrioritizedBoard> {
    const evidence = await Feature6Client.getLatestEvidence(studentId);
    const signals = PriorityEngine.score(ProblemDetectionService.detect(evidence));

    const actionable = signals.filter((s) => s.problem_type !== 'STABLE_STRENGTH');
    const maintain = signals.filter((s) => s.problem_type === 'STABLE_STRENGTH');

    return {
      top: actionable.slice(0, 1),
      secondary: actionable.slice(1, 3),
      maintain,
    };
  }

  /** §4 / §8 / §34 — the single next-best-action, persisted as a StudentAction. */
  static async recommend(studentId: StudentId): Promise<StudentAction | null> {
    const { top } = await NextBestActionService.board(studentId);
    if (top.length === 0) return null;

    const signal = NextBestActionService.applyAdaptation(studentId, top[0]);
    const plan = InterventionService.selectFor(signal);
    const why = await ExplanationService.explain(signal, plan);

    return ActionRepo.insert({
      student_id: studentId,
      action_type: plan.action_type,
      target_skill: signal.skill_id,
      target_skill_name: signal.skill_name,
      priority: signal.priority,
      priority_score: signal.priority_score,
      reason: signal.details,
      why_this: why,
      duration_minutes: plan.duration_minutes,
      expected_outcome: `Improve ${signal.skill_name} enough to change what your next diagnosed bottleneck is.`,
      required_feature: plan.required_feature,
      success_metric: plan.success_metric,
      verification_method: plan.verification_method,
      evidence: [{ label: 'Signal', value: signal.details }],
      confidence: plan.confidence,
      status: ActionStatus.RECOMMENDED,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * §25 ACTION ADAPTATION — if the student has repeatedly skipped this same
   * skill, shrink the ask instead of repeating the identical recommendation
   * a third time. Forcing low confidence routes it through
   * InterventionService's short-diagnostic path (§18).
   */
  private static applyAdaptation(studentId: StudentId, signal: ScoredSignal): ScoredSignal {
    const recentSkips = ActionRepo.find(
      (a) => a.student_id === studentId && a.target_skill === signal.skill_id && a.status === ActionStatus.SKIPPED
    );
    if (recentSkips.length >= 2) {
      return { ...signal, confidence: Confidence.LOW };
    }
    return signal;
  }
}

export interface PlannedItem {
  skill_name: string;
  action_type: string;
  duration_minutes: number;
}

// ============================================================================
// ActionPlanService — §9 DAILY ACTION PLAN + §10 TIME-AWARE PLANNING
// Greedy-by-priority assembly of a plan that fits the student's available
// time, built from real evidence rather than an arbitrary schedule (§9).
// ============================================================================
export class ActionPlanService {
  static async buildPlan(studentId: StudentId, minutesAvailable: number): Promise<PlannedItem[]> {
    const board = await NextBestActionService.board(studentId);
    const ordered: ScoredSignal[] = [...board.top, ...board.secondary];

    const plan: PlannedItem[] = [];
    let remaining = minutesAvailable;

    for (const signal of ordered) {
      const intervention = InterventionService.selectFor(signal);
      const fits = intervention.duration_minutes <= remaining;
      if (fits || plan.length === 0) {
        plan.push({
          skill_name: signal.skill_name,
          action_type: intervention.action_type,
          duration_minutes: intervention.duration_minutes,
        });
        remaining -= intervention.duration_minutes;
      }
      if (remaining <= 0) break;
    }

    return plan;
  }
}
