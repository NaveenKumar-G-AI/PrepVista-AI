import { Bottleneck, GapAnalysis, LearningGoal, PriorityCategory, PriorityFactors, PriorityItem } from "../types";

// Section 14: "Priority must be explainable." Two design choices here,
// both deliberate departures from the spec's illustrative product formula:
//
// 1. Factors are combined with weighted sums, not one big product — a pure
//    multiplicative formula lets any single near-zero factor erase an
//    otherwise urgent item, producing a score a student can't reason about.
// 2. Within that sum, gapMagnitude (severity) still GATES prerequisiteImpact
//    and goalRelevance rather than sitting alongside them as an equal,
//    independent term. Without the gate, a skill that is barely weak but
//    happens to sit upstream of several others (high prerequisiteImpact)
//    could outrank a skill that is genuinely failing — which is exactly the
//    "priority feels arbitrary" failure mode Section 14 warns against.
//
// urgency / assessmentWeight / retentionRisk / transferRisk / confidence are
// goal-level in this implementation (identical for every skill under one
// goal at one point in time), so they shift a skill's absolute score/
// category as a deadline approaches without disturbing the relative
// ordering that gapMagnitude + prerequisiteImpact already established.
const WEIGHTS = {
  prerequisiteImpact: 0.3,
  goalRelevance: 0.2,
  expectedImprovement: 0.1,
  urgency: 0.15,
  assessmentWeight: 0.1,
  retentionRisk: 0.05,
  transferRisk: 0.05,
  confidence: 0.1,
  timeCost: -0.05, // higher time cost slightly reduces priority, all else equal
};

function categorize(score: number): PriorityCategory {
  if (score >= 0.62) return PriorityCategory.CRITICAL;
  if (score >= 0.48) return PriorityCategory.HIGH;
  if (score >= 0.32) return PriorityCategory.MEDIUM;
  if (score >= 0.18) return PriorityCategory.LOW;
  return PriorityCategory.MAINTENANCE;
}

function urgencyFromDeadline(deadline?: string): number {
  if (!deadline) return 0.4;
  const days = (new Date(deadline).getTime() - Date.now()) / 86_400_000;
  if (days <= 3) return 1;
  if (days <= 10) return 0.8;
  if (days <= 30) return 0.55;
  if (days <= 90) return 0.35;
  return 0.2;
}

function weightedScore(factors: PriorityFactors): number {
  const skillSignal =
    factors.gapMagnitude * (0.5 + factors.prerequisiteImpact * WEIGHTS.prerequisiteImpact + factors.goalRelevance * WEIGHTS.goalRelevance) +
    factors.expectedImprovement * WEIGHTS.expectedImprovement;

  const contextSignal =
    factors.urgency * WEIGHTS.urgency +
    factors.assessmentWeight * WEIGHTS.assessmentWeight +
    factors.retentionRisk * WEIGHTS.retentionRisk +
    factors.transferRisk * WEIGHTS.transferRisk +
    factors.confidence * WEIGHTS.confidence +
    factors.timeCost * WEIGHTS.timeCost;

  return skillSignal + contextSignal;
}

/**
 * Turns ranked bottlenecks + gaps into an explainable, categorized priority
 * list (Section 15: show the current highest-impact priority, optionally a
 * couple of secondary ones — never a wall of scores).
 */
export function computePriorities(gaps: GapAnalysis[], bottlenecks: Bottleneck[], goal: LearningGoal): PriorityItem[] {
  const urgency = urgencyFromDeadline(goal.deadline);
  const transferGap = gaps.find((g) => g.metric === "transfer");
  const retentionGap = gaps.find((g) => g.metric === "retention");

  return bottlenecks
    .map((b) => {
      const factors: PriorityFactors = {
        goalRelevance: b.goalRelevance,
        gapMagnitude: b.severity,
        prerequisiteImpact: b.prerequisiteImpact,
        urgency,
        assessmentWeight: goal.requiredCapabilities?.length ? 0.7 : 0.5,
        retentionRisk: retentionGap?.status === "GAP" ? 0.6 : 0.2,
        transferRisk: transferGap?.status === "GAP" ? 0.6 : 0.2,
        expectedImprovement: b.improvementPotential,
        timeCost: 0.4,
        confidence: transferGap?.confidence ?? 0.6,
      };

      const score = weightedScore(factors);

      return {
        id: `priority-${b.skillId}`,
        label: b.skillName,
        category: categorize(score),
        score,
        factors,
        reason: b.reason,
        skillId: b.skillId,
      };
    })
    .sort((a, b) => b.score - a.score);
}
