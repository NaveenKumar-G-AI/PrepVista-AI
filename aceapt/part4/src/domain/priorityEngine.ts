import type { Diagnosis, PriorityFactors, PriorityScore, Skill, StudentContext } from "./types.js";
import { RELAXED_DEADLINE_DAYS, URGENT_DEADLINE_DAYS } from "./types.js";
import type { SkillGraph } from "./skillGraph.js";
import { daysSince } from "./evidence.js";

const WEIGHTS = {
  gap: 0.3,
  downstream: 0.2,
  goal: 0.2,
  deadline: 0.15,
  blockingBonus: 0.2,
  effort: 0.1,
};

const GAP_WEIGHT: Record<Diagnosis["primaryGap"], number> = {
  FOUNDATION: 1.0,
  APPLICATION: 0.75,
  MISCONCEPTION: 0.9,
  TRANSFER: 0.55,
  SPEED: 0.4,
  STALE: 0.35,
  NONE: 0.0,
};

const ACTION_EFFORT_MINUTES: Record<string, number> = {
  LEARN: 25,
  RELEARN: 20,
  PRACTICE: 15,
  DRILL: 10,
  REVIEW: 10,
  TRANSFER: 15,
  SPEED_TRAIN: 12,
  RETEST: 10,
  ADVANCE: 5,
  REST: 0,
};

export function estimateEffortMinutes(actionType: string): number {
  return ACTION_EFFORT_MINUTES[actionType] ?? 15;
}

/** 0 (no deadline / far off) .. 1 (deadline is now or overdue). Linear decay between urgent and relaxed. */
export function urgencyFromDeadline(deadlineIso: string | null, now: Date = new Date()): number {
  if (!deadlineIso) return 0.25; // mild default so goal-relevant work still edges out purely-someday work
  const daysUntil = (new Date(deadlineIso).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= URGENT_DEADLINE_DAYS) return 1;
  if (daysUntil >= RELAXED_DEADLINE_DAYS) return 0;
  return 1 - (daysUntil - URGENT_DEADLINE_DAYS) / (RELAXED_DEADLINE_DAYS - URGENT_DEADLINE_DAYS);
}

export function goalRelevanceOf(skill: Skill, context: StudentContext): number {
  if (context.goal === "SPECIFIC_TARGET" && context.targetSkillIds?.includes(skill.id)) return 1;
  return skill.baseRelevance[context.goal] ?? 0.5;
}

export function computePriority(
  skill: Skill,
  diagnosis: Diagnosis,
  actionType: string,
  context: StudentContext,
  graph: SkillGraph,
  isBlockingPrerequisite: boolean
): PriorityScore {
  const gapSize = GAP_WEIGHT[diagnosis.primaryGap];
  const downstreamImpact = graph.downstreamCount(skill.id) / graph.maxDownstreamCount();
  const goalRelevance = goalRelevanceOf(skill, context);
  const deadlineUrgency = urgencyFromDeadline(context.deadline);
  const effortPenaltyMinutes = estimateEffortMinutes(actionType);

  const factors: PriorityFactors = {
    gapSize,
    downstreamImpact,
    goalRelevance,
    deadlineUrgency,
    isBlocking: isBlockingPrerequisite,
    effortPenaltyMinutes,
  };

  const score =
    gapSize * WEIGHTS.gap +
    downstreamImpact * WEIGHTS.downstream +
    goalRelevance * WEIGHTS.goal +
    deadlineUrgency * WEIGHTS.deadline +
    (isBlockingPrerequisite ? WEIGHTS.blockingBonus : 0) -
    (effortPenaltyMinutes / 60) * WEIGHTS.effort;

  return { skillId: skill.id, score, factors };
}

export { daysSince };
