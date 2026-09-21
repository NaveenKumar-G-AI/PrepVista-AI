import { ActionRepo, OutcomeRepo, ReadinessRepo, EvidenceRepo } from '../db/repositories';
import { Feature5Client } from './integrations/Feature5Client';
import { Feature6Client } from './integrations/Feature6Client';
import { MilestoneService } from './goalsAndMilestones';
import { ActionOutcome, ActionStatus, SkipReason, StudentId } from '../types';

// ============================================================================
// ActionOutcomeService — §13 ACTION → OUTCOME GRAPH
// Thin query/record layer over outcomes, kept separate from execution so
// "what happened" stays decoupled from "how we ran the action."
// ============================================================================
export class ActionOutcomeService {
  static record(outcome: Omit<ActionOutcome, 'id'>): ActionOutcome {
    return OutcomeRepo.insert(outcome);
  }

  static forStudent(studentId: StudentId): ActionOutcome[] {
    return OutcomeRepo.find((o) => o.student_id === studentId);
  }

  static forAction(actionId: string): ActionOutcome | undefined {
    return OutcomeRepo.findOne((o) => o.action_id === actionId);
  }
}

// ============================================================================
// InterventionEffectivenessService — §12 INTERVENTION EFFECTIVENESS
// ============================================================================
export class InterventionEffectivenessService {
  static classify(
    before: Record<string, number>,
    after: Record<string, number>
  ): ActionOutcome['effectiveness'] {
    const keys = Object.keys(after).filter((k) => before[k] !== undefined);
    if (keys.length === 0) return 'PENDING';
    const avgDelta = keys.reduce((sum, k) => sum + (after[k] - before[k]), 0) / keys.length;
    if (avgDelta >= 8) return 'EFFECTIVE';
    if (avgDelta >= 2) return 'PARTIALLY_EFFECTIVE';
    return 'NOT_EFFECTIVE';
  }

  /** Which intervention types have actually worked for this student, so far. */
  static summaryFor(studentId: StudentId) {
    const outcomes = ActionOutcomeService.forStudent(studentId);
    const byType: Record<string, { count: number; effective: number; deltaSum: number }> = {};

    for (const outcome of outcomes) {
      const action = ActionRepo.getById(outcome.action_id);
      if (!action) continue;
      const type = action.action_type;
      byType[type] ??= { count: 0, effective: 0, deltaSum: 0 };

      const keys = Object.keys(outcome.after_metrics).filter((k) => outcome.before_metrics[k] !== undefined);
      const avg = keys.length
        ? keys.reduce((s, k) => s + (outcome.after_metrics[k] - outcome.before_metrics[k]), 0) / keys.length
        : 0;

      byType[type].count += 1;
      byType[type].effective += outcome.effectiveness === 'EFFECTIVE' ? 1 : 0;
      byType[type].deltaSum += avg;
    }

    return Object.entries(byType).map(([action_type, v]) => ({
      action_type,
      sessions: v.count,
      effective_rate: Math.round((v.effective / v.count) * 100),
      avg_improvement: Math.round((v.deltaSum / v.count) * 10) / 10,
    }));
  }
}

// ============================================================================
// ActionExecutionService — §24 ACTION COMPLETION + §11 ADAPTIVE PRIORITY
// Owns the RECOMMENDED → STARTED → COMPLETED/SKIPPED lifecycle. Completing
// an action writes the improvement back into evidence (§11 — "must not
// continue recommending yesterday's problem") and into milestones (§22),
// then asks Feature 6 to reassess so effect is measured, not assumed (§12).
// ============================================================================
export class ActionExecutionService {
  static async start(actionId: string) {
    const action = ActionRepo.getById(actionId);
    if (!action) throw new Error('Action not found');
    const session = await Feature5Client.dispatch(action);
    return ActionRepo.update(actionId, {
      status: ActionStatus.STARTED,
      started_at: new Date().toISOString(),
      session_ref: session.session_ref,
    });
  }

  /** §24 / §29 — skipping is tracked with an optional reason, never punished. */
  static skip(actionId: string, reason?: SkipReason) {
    return ActionRepo.update(actionId, {
      status: ActionStatus.SKIPPED,
      skip_reason: reason ?? SkipReason.NOT_STATED,
    });
  }

  static async complete(
    actionId: string,
    beforeMetrics: Record<string, number>,
    afterMetrics: Record<string, number>
  ) {
    const action = ActionRepo.getById(actionId);
    if (!action) throw new Error('Action not found');

    ActionRepo.update(actionId, { status: ActionStatus.COMPLETED, completed_at: new Date().toISOString() });

    // §11 ADAPTIVE PRIORITY — write the improvement back into evidence so
    // the *next* next-best-action call reflects it instead of repeating
    // yesterday's problem.
    const evidence = EvidenceRepo.findOne((e) => e.student_id === action.student_id && e.skill_id === action.target_skill);
    if (evidence) {
      const patch: Partial<typeof evidence> = { attempts: evidence.attempts + 1, updated_at: new Date().toISOString() };
      if (afterMetrics.accuracy !== undefined) patch.accuracy = afterMetrics.accuracy;
      if (afterMetrics.concept_mastery !== undefined) patch.concept_mastery = afterMetrics.concept_mastery;
      if (afterMetrics.avg_solving_time_sec !== undefined) patch.avg_solving_time_sec = afterMetrics.avg_solving_time_sec;
      if (afterMetrics.mixed_topic_accuracy !== undefined) patch.mixed_topic_accuracy = afterMetrics.mixed_topic_accuracy;
      if (afterMetrics.timed_accuracy !== undefined) patch.timed_accuracy = afterMetrics.timed_accuracy;
      if (action.action_type === 'ERROR_REPAIR') patch.error_tags = [];
      EvidenceRepo.update(evidence.id, patch);
    }

    const outcome = ActionOutcomeService.record({
      action_id: actionId,
      student_id: action.student_id,
      before_metrics: beforeMetrics,
      after_metrics: afterMetrics,
      effectiveness: InterventionEffectivenessService.classify(beforeMetrics, afterMetrics),
      confidence: action.confidence,
      created_at: new Date().toISOString(),
    });

    // §22 — keep milestones synced to the same evidence, requiring the
    // sustained progress MilestoneService already enforces (§16).
    if (afterMetrics.accuracy !== undefined) {
      MilestoneService.updateProgressForSkill(action.student_id, action.target_skill, afterMetrics.accuracy);
    }

    if (afterMetrics.readiness !== undefined) {
      ReadinessRepo.insert({
        student_id: action.student_id,
        readiness: afterMetrics.readiness,
        taken_at: new Date().toISOString(),
        source: 'MINI_ASSESSMENT',
        driver_action_id: actionId,
      });
      MilestoneService.updateReadinessMilestone(action.student_id, afterMetrics.readiness);
    }

    await Feature6Client.triggerReassessment(action.student_id, [action.target_skill]);
    return outcome;
  }
}
