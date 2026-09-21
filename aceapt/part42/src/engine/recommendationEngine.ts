import type { BottleneckSignal, RecommendedAction, SkillEstimate } from "../types/domain.js";

const PRIORITY_RANK: Record<RecommendedAction["priority"], number> = { high: 0, medium: 1, low: 2 };

function actionForStatus(estimate: SkillEstimate): { action: string; priority: RecommendedAction["priority"] } {
  switch (estimate.status) {
    case "needs_focus":
      return { action: "guided_practice", priority: estimate.confidenceState === "low" ? "medium" : "high" };
    case "developing":
      return { action: "practice_mixed_problems", priority: "medium" };
    case "solid":
      return { action: "reinforcement_practice", priority: "low" };
    case "strong":
      return { action: "advance_to_harder_material", priority: "low" };
    case "insufficient_evidence":
      return { action: "verification_assessment", priority: "low" };
  }
}

function rationaleFor(estimate: SkillEstimate, isBottleneck: boolean): string {
  if (estimate.confidenceState === "incomplete" || estimate.confidenceState === "low") {
    return `Based on limited evidence so far (${estimate.evidenceCount} response(s)) — treat this as an early signal.`;
  }
  if (isBottleneck) {
    return `Weak here appears connected to weaker performance on skills that build on it — addressing this first may help elsewhere too.`;
  }
  if (estimate.consistencyFlag) {
    return `Performance on this skill has been inconsistent — worth more targeted practice to see a stable pattern.`;
  }
  return `Based on ${estimate.evidenceCount} independent response(s) at ${estimate.confidenceState} confidence.`;
}

/** Module 27: seeds mastery, is never itself verified mastery — the caller (Feature 4-equivalent) owns that distinction. */
export function buildRecommendations(
  skillEstimates: SkillEstimate[],
  bottlenecks: BottleneckSignal[],
  maxRecommendations = 6,
): RecommendedAction[] {
  const bottleneckSkillIds = new Set(bottlenecks.flatMap((b) => b.possibleBottleneckOf));

  const leafEstimates = skillEstimates.filter((e) => e.nodeLevel === "skill" && e.status !== "strong");

  const recommendations: RecommendedAction[] = leafEstimates.map((estimate) => {
    const { action, priority } = actionForStatus(estimate);
    const isBottleneck = bottleneckSkillIds.has(estimate.skillNodeId);
    return {
      skillNodeId: estimate.skillNodeId,
      priority: isBottleneck && priority !== "high" ? "high" : priority,
      recommendedAction: action,
      evidenceConfidence: estimate.confidenceState,
      rationale: rationaleFor(estimate, isBottleneck),
    };
  });

  return recommendations
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, maxRecommendations);
}
