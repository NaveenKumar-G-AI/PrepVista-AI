// Deterministic priority scoring (Sections 21-22). No LLM - a
// transparent weighted formula over real inputs, with every factor
// exposed so goalExplanationService can cite actual numbers instead of
// having an LLM invent a reason (Section 36).
import type {
  CapabilityDimension,
  CapabilitySnapshot,
  DimensionalGap,
  GoalType,
  PriorityResult,
  PriorityScoreBreakdown,
  PriorityTarget,
  SpeedBand,
} from "../domain/types.js";

// Weight budget sums to 1.0. Kept as named constants (not magic numbers)
// so the formula can be audited or tuned without touching the logic.
const W_GOAL_RELEVANCE = 0.3;
const W_GAP = 0.3;
const W_LEARNING_OPPORTUNITY = 0.25;
const W_ASSESSMENT_RELEVANCE = 0.15;

// How strongly a tight deadline shifts weight from raw gap size toward
// quick-win potential (Section 16: "if deadline is very short,
// prioritize high-impact skills").
const URGENCY_GAP_DAMPENING = 0.4;
const URGENCY_OPPORTUNITY_BOOST = 0.6;

const SPEED_RANK: Record<SpeedBand, number> = {
  SLOW: 0,
  DEVELOPING: 1,
  ON_PACE: 2,
  FAST: 3,
};

/** Which dimensions a given goal type cares about "by default", before
 * looking at what the student/goal explicitly targeted. This is a fixed,
 * auditable lookup table, not a model. */
function baseGoalRelevance(goalType: GoalType, dimension: CapabilityDimension): number {
  switch (goalType) {
    case "PLACEMENT_READINESS":
    case "OVERALL_APTITUDE":
    case "PERFORMANCE_IMPROVEMENT":
      return 1.0; // broad goals - every measured dimension matters
    case "ASSESSMENT_PREPARATION":
      return 0.8; // refined further by assessmentRelevance when known
    case "SKILL_IMPROVEMENT":
    case "CUSTOM":
      return 0.3; // sharpened to 1.0 below for whatever was explicitly targeted
    case "SPEED_IMPROVEMENT":
    case "ACCURACY_IMPROVEMENT":
      return 0.2; // these goals are mostly about the speed/accuracy axes,
    // not individual capability dimensions
    default:
      return 0.3;
  }
}

export interface PriorityEngineInput {
  goalType: GoalType;
  gap: DimensionalGap;
  current: CapabilitySnapshot;
  /** Dimensions the student or the goal itself explicitly named as the
   * focus (e.g. a SKILL_IMPROVEMENT goal's chosen skill, or a
   * student-reported weakness resolved to a real dimension) - distinct
   * from dimensions that merely received a *default benchmark* target.
   * Only this set earns the "explicitly targeted" relevance boost. */
  explicitlyTargetedDimensions?: ReadonlySet<CapabilityDimension>;
  targetSpeedBand: SpeedBand | null;
  targetAccuracy: number | null;
  daysRemaining: number | null; // null = no deadline (Section 47)
  /** Optional per-dimension weight from a known assessment pattern
   * (Section 48). Omitted entirely - not defaulted to a guess - when
   * ACEAPT has no validated pattern for the student's selected
   * assessment/company. */
  assessmentTopicWeights?: Partial<Record<CapabilityDimension, number>>;
}

export function computePriority(input: PriorityEngineInput): PriorityResult {
  const urgency = computeUrgency(input.daysRemaining);
  const gapWeight = W_GAP * (1 - URGENCY_GAP_DAMPENING * urgency);
  const opportunityWeight = W_LEARNING_OPPORTUNITY * (1 + URGENCY_OPPORTUNITY_BOOST * urgency);

  const maxRate = maxImprovementRate(input.current);

  const dimensionScores: PriorityScoreBreakdown[] = input.gap.capability
    .filter((g) => g.gap !== null) // can't rank what we can't measure a gap for
    .map((g) => {
      const explicitlyTargeted = input.explicitlyTargetedDimensions?.has(g.dimension) ?? false;
      const goalRelevance = explicitlyTargeted
        ? 1.0
        : baseGoalRelevance(input.goalType, g.dimension);
      const normalizedGap = clamp01((g.gap ?? 0) / 100);
      const assessmentRelevance = input.assessmentTopicWeights?.[g.dimension] ?? 0.5;
      const rate = input.current.improvementRatePerHour?.[g.dimension];
      const learningOpportunity = rate === undefined ? 0.5 : clamp01(rate / maxRate);

      const score = round3(
        W_GOAL_RELEVANCE * goalRelevance +
          gapWeight * normalizedGap +
          opportunityWeight * learningOpportunity +
          W_ASSESSMENT_RELEVANCE * assessmentRelevance
      );

      return {
        target: g.dimension,
        goalRelevance: round3(goalRelevance),
        normalizedGap: round3(normalizedGap),
        assessmentRelevance: round3(assessmentRelevance),
        learningOpportunity: round3(learningOpportunity),
        score,
        reason: buildReason(g.dimension, g.current, g.target, g.gap, goalRelevance, urgency),
      };
    });

  const speedScore = scoreSpeed(input, urgency, gapWeight, opportunityWeight);
  const accuracyScore = scoreAccuracy(input, urgency, gapWeight, opportunityWeight);

  const ranked = [...dimensionScores, ...(speedScore ? [speedScore] : []), ...(accuracyScore ? [accuracyScore] : [])].sort(
    (a, b) => b.score - a.score
  );

  return {
    ranked,
    top: ranked[0]?.target ?? null,
    timeUrgency: round3(urgency),
  };
}

function scoreSpeed(
  input: PriorityEngineInput,
  urgency: number,
  gapWeight: number,
  opportunityWeight: number
): PriorityScoreBreakdown | null {
  if (!input.targetSpeedBand || !input.current.speedBand) return null;
  const currentRank = SPEED_RANK[input.current.speedBand];
  const targetRank = SPEED_RANK[input.targetSpeedBand];
  const gapBands = Math.max(0, targetRank - currentRank);
  if (gapBands === 0) return null; // already met - not a priority

  const goalRelevance = input.goalType === "SPEED_IMPROVEMENT" ? 1.0 : 0.4;
  const normalizedGap = clamp01(gapBands / 3);
  const learningOpportunity = 0.5; // neutral: no per-speed-band improvement-rate evidence modeled
  const assessmentRelevance = 0.5;

  const score = round3(
    W_GOAL_RELEVANCE * goalRelevance +
      gapWeight * normalizedGap +
      opportunityWeight * learningOpportunity +
      W_ASSESSMENT_RELEVANCE * assessmentRelevance
  );

  return {
    target: "speed",
    goalRelevance: round3(goalRelevance),
    normalizedGap: round3(normalizedGap),
    assessmentRelevance: round3(assessmentRelevance),
    learningOpportunity,
    score,
    reason: `Current pace is ${input.current.speedBand.toLowerCase()}, below the ${input.targetSpeedBand.toLowerCase()} pace this goal targets.`,
  };
}

function scoreAccuracy(
  input: PriorityEngineInput,
  urgency: number,
  gapWeight: number,
  opportunityWeight: number
): PriorityScoreBreakdown | null {
  if (input.targetAccuracy === null || input.current.accuracy === undefined) return null;
  const gap = input.targetAccuracy - input.current.accuracy;
  if (gap <= 0) return null;

  const goalRelevance = input.goalType === "ACCURACY_IMPROVEMENT" ? 1.0 : 0.4;
  const normalizedGap = clamp01(gap / 100);
  const learningOpportunity = 0.5;
  const assessmentRelevance = 0.5;

  const score = round3(
    W_GOAL_RELEVANCE * goalRelevance +
      gapWeight * normalizedGap +
      opportunityWeight * learningOpportunity +
      W_ASSESSMENT_RELEVANCE * assessmentRelevance
  );

  return {
    target: "accuracy",
    goalRelevance: round3(goalRelevance),
    normalizedGap: round3(normalizedGap),
    assessmentRelevance: round3(assessmentRelevance),
    learningOpportunity,
    score,
    reason: `Accuracy is currently ${input.current.accuracy}%, ${round2(gap)} points below this goal's ${input.targetAccuracy}% target.`,
  };
}

function buildReason(
  dimension: string,
  current: number | null,
  target: number | null,
  gap: number | null,
  goalRelevance: number,
  urgency: number
): string {
  const label = dimension.replace(/_/g, " ");
  if (current === null || target === null || gap === null) {
    return `${label}: not enough data yet to compare against a target.`;
  }
  const relevanceNote = goalRelevance >= 0.9 ? " and is a focus of this goal" : "";
  const urgencyNote = urgency > 0.5 ? " Time remaining is short, so quick-win potential was weighted more heavily." : "";
  return `Current ${label} performance (${current}) is ${gap} point${gap === 1 ? "" : "s"} below the ${target} target${relevanceNote}.${urgencyNote}`;
}

/** 1.0 = extremely urgent (very little time left), 0.0 = no urgency
 * (long runway or no deadline at all). A 45-day runway is treated as
 * "not urgent" - chosen deliberately generous so the engine only leans
 * on quick-wins when time is genuinely tight. */
function computeUrgency(daysRemaining: number | null): number {
  if (daysRemaining === null) return 0;
  if (daysRemaining <= 0) return 1;
  const URGENCY_HORIZON_DAYS = 45;
  return clamp01(1 - daysRemaining / URGENCY_HORIZON_DAYS);
}

function maxImprovementRate(current: CapabilitySnapshot): number {
  const rates = Object.values(current.improvementRatePerHour ?? {}).filter(
    (v): v is number => typeof v === "number"
  );
  if (rates.length === 0) return 1; // avoid divide-by-zero; learningOpportunity defaults to 0.5 anyway when a rate is missing
  return Math.max(...rates, 0.01);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
