import type {
  StrategyContext,
  ConstraintCheckResult,
  DriftReport,
  ContradictionFlag,
  NextMoveCandidateScore,
} from '../types/strategy.js';
import type { PriorityWeights } from '../types/domain.js';
import { clamp } from './utils.js';

// Rough effort model per move kind, in hours/week, used only when the caller
// doesn't supply a more specific estimate. Kept conservative and visible here
// (not buried in a magic number) so it's easy to tune per real usage data.
const DEFAULT_EFFORT_HOURS: Record<string, number> = {
  apply_to_opportunity: 2,
  prepare_for_interview: 4,
  build_project: 8,
  improve_skill: 5,
  fix_resume_evidence: 2,
  practice_weak_area: 3,
  gather_information: 1,
  contact_mentor: 1,
  validate_opportunity: 1,
  stop_low_value_activity: 0,
  wait_and_monitor: 0,
  change_strategy: 2,
};

/**
 * spec #37-39: CONSTRAINT ENGINE + OVERCOMMITMENT DETECTOR.
 *
 * Never recommend a plan that doesn't fit the student's stated time budget.
 * plannedActionKinds should be the set of actions currently accepted /
 * in_progress, i.e. what the student is actually committed to right now.
 */
export function checkConstraints(ctx: StrategyContext, plannedActionKinds: string[]): ConstraintCheckResult {
  const timeConstraint = ctx.constraints.find((c) => c.type === 'time' && c.hoursPerWeek != null);
  const availableHoursPerWeek = timeConstraint?.hoursPerWeek ?? null;

  const plannedHoursPerWeek = plannedActionKinds.reduce((sum, kind) => sum + (DEFAULT_EFFORT_HOURS[kind] ?? 2), 0);

  const violations: string[] = [];
  let overcommitted = false;

  if (availableHoursPerWeek != null && plannedHoursPerWeek > availableHoursPerWeek) {
    overcommitted = true;
    violations.push(
      `Planned actions need about ${plannedHoursPerWeek}h/week but only ${availableHoursPerWeek}h/week is available.`,
    );
  }

  const locationConstraint = ctx.constraints.find((c) => c.type === 'location');
  if (locationConstraint) {
    const remoteOnlyMismatch = ctx.opportunities.some(
      (o) => !o.applied && o.relevanceToGoal >= 0.6 && /on-site|onsite|relocation/i.test(o.title),
    );
    if (remoteOnlyMismatch && /remote|no relocation/i.test(locationConstraint.description)) {
      violations.push('Some high-relevance opportunities require on-site/relocation, which conflicts with the stated location constraint.');
    }
  }

  return {
    ok: violations.length === 0,
    availableHoursPerWeek,
    plannedHoursPerWeek,
    violations,
    overcommitted,
  };
}

/** Effort estimate (hours/week) for a single candidate — exported so the
 * next-best-move engine can use the same numbers when scoring "effort". */
export function estimateEffortHours(kind: string): number {
  return DEFAULT_EFFORT_HOURS[kind] ?? 2;
}

/** Given a constraint check, mark candidates that would push the student over
 * their stated capacity if accepted on top of what's already planned. */
export function flagConstraintViolations(
  candidates: NextMoveCandidateScore[],
  ctx: StrategyContext,
  alreadyPlannedKinds: string[],
): NextMoveCandidateScore[] {
  const baseline = checkConstraints(ctx, alreadyPlannedKinds);
  if (baseline.availableHoursPerWeek == null) return candidates;

  return candidates.map((c) => {
    const projected = baseline.plannedHoursPerWeek + estimateEffortHours(c.kind);
    const violatesConstraints = projected > baseline.availableHoursPerWeek!;
    return { ...c, violatesConstraints };
  });
}

// ---------------------------------------------------------------------------
// spec #13-14: STRATEGY DRIFT DETECTOR
// ---------------------------------------------------------------------------

export function detectDrift(ctx: StrategyContext): DriftReport {
  if (!ctx.goal || ctx.recentActions.length < 3) {
    return { driftDetected: false, overlapRatio: null, disconnectedActions: [], explanation: 'Not enough recent activity to assess.' };
  }

  const requiredSkillSet = new Set(ctx.goal.requiredSkills.map((s) => s.toLowerCase()));
  const recent = ctx.recentActions.slice(-8);

  const connected = recent.filter((a) => {
    const title = a.title.toLowerCase();
    return [...requiredSkillSet].some((skill) => title.includes(skill)) || a.kind !== 'gather_information';
  });

  const overlapRatio = connected.length / recent.length;
  const disconnected = recent.filter((a) => !connected.includes(a)).map((a) => a.title);

  const driftDetected = overlapRatio < 0.4 && recent.length >= 4;

  return {
    driftDetected,
    overlapRatio: clamp(overlapRatio),
    disconnectedActions: disconnected,
    explanation: driftDetected
      ? `Your recent activity appears less connected to your selected target role (${ctx.goal.targetRole}). ${disconnected.length} of your last ${recent.length} actions don't clearly tie back to it.`
      : 'Recent activity still tracks reasonably well against the current goal.',
  };
}

// ---------------------------------------------------------------------------
// spec #34: DECISION CONTRADICTION DETECTOR
// ---------------------------------------------------------------------------

const PRIORITY_RISK_HINTS: Partial<Record<keyof PriorityWeights, RegExp>> = {
  stability: /unpaid|no[\s-]?guarantee|high[\s-]?risk|volatile|contract-to-hire|equity[\s-]?only/i,
  income: /unpaid|stipend|below\s?market/i,
};

export function detectContradiction(ctx: StrategyContext): ContradictionFlag {
  const latestDecision = ctx.recentDecisions[ctx.recentDecisions.length - 1];
  if (!latestDecision?.chosenOption) {
    return { detected: false, priority: null, decisionSummary: '', question: '' };
  }

  const chosen = latestDecision.chosenOption.toLowerCase();
  const priorities = ctx.priorities;

  for (const [priority, weight] of Object.entries(priorities) as [keyof PriorityWeights, number | undefined][]) {
    if (!weight || weight < 0.6) continue; // only flag when the student weighted this priority highly
    const hint = PRIORITY_RISK_HINTS[priority];
    if (hint && hint.test(chosen)) {
      return {
        detected: true,
        priority,
        decisionSummary: latestDecision.chosenOption,
        question: `You told us ${String(priority)} matters a lot to you, and this decision ("${latestDecision.chosenOption}") looks like it trades some of that away. Is that tradeoff intentional?`,
      };
    }
  }

  return { detected: false, priority: null, decisionSummary: '', question: '' };
}
