import type { DimensionGrowth, GrowthInsight, GrowthMilestone, InsightType, RecommendedAction } from "../types.ts";
import { RULES_VERSION } from "../config.ts";

function friendlyDimension(dim: string): string {
  return dim.replace(/^role:[^:]+:/, "").replace(/_/g, " ");
}

function recommendedAction(type: InsightType, growth: DimensionGrowth): RecommendedAction | null {
  switch (type) {
    case "REGRESSION":
      return { kind: growth.dimension === "debugging" ? "DEBUGGING_PRACTICE" : "ADAPTIVE_CHALLENGE", dimension: growth.dimension, reason: type };
    case "STAGNATION":
      return { kind: "ADAPTIVE_CHALLENGE", dimension: growth.dimension, reason: type };
    case "DEVELOPMENT_AREA":
      return { kind: growth.transferEvidenceCount === 0 ? "TRANSFER_CHALLENGE" : "ADAPTIVE_CHALLENGE", dimension: growth.dimension, reason: type };
    case "RETENTION":
      return { kind: "RETENTION_CHECK", dimension: growth.dimension, reason: type };
    default:
      return null;
  }
}

function claimFor(type: InsightType, growth: DimensionGrowth): string {
  const dim = friendlyDimension(growth.dimension);
  switch (type) {
    case "IMPROVEMENT":
      return `${cap(dim)} has moved from ${label(growth.baselineState)} to ${label(growth.state)} across ${growth.evidenceCount} relevant demonstrations.`;
    case "REGRESSION":
      return `Recent ${dim} evidence is below the earlier baseline (${label(growth.baselineState)} → ${label(growth.state)}), based on ${growth.evidenceCount} recent demonstrations.`;
    case "STAGNATION":
      return `Activity in ${dim} has been steady, but recent evidence shows limited movement in outcome — practice volume alone hasn't translated into a measurable change yet.`;
    case "RECOVERY":
      return `${cap(dim)} shows a recovery pattern: after a dip, recent evidence trends back toward ${label(growth.state)}.`;
    case "TRANSFER_GAIN":
      return `${cap(dim)} evidence now includes successful transfer across ${growth.transferEvidenceCount} different-context demonstrations, not just repeated familiar problems.`;
    case "RETENTION":
      return `A recent ${dim} demonstration after a gap in practice confirms the skill is still accessible, not just recently rehearsed.`;
    case "INDEPENDENCE_GAIN":
      return `Recent ${dim} performance has held up with less assistance than earlier attempts.`;
    case "DEVELOPMENT_AREA":
      return `Recent evidence suggests ${dim} performance remains ${growth.state === "STAGNATING" ? "flat" : "inconsistent"} and is a reasonable next focus area.`;
    case "MILESTONE":
      return `New milestone reached in ${dim}.`;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function label(state: string | null): string {
  if (!state) return "no prior baseline";
  return state.toLowerCase().replace(/_/g, " ");
}

/**
 * Converts one dimension's computed growth into zero or more insights.
 * Gated on BOTH state (the state machine already enforces its own evidence
 * thresholds) and confidence (defense in depth — an insight is never
 * surfaced below LOW confidence, matching "only create an insight when
 * evidence thresholds are satisfied").
 */
export function generateInsightsForDimension(studentId: string, growth: DimensionGrowth, now: Date = new Date()): GrowthInsight[] {
  if (growth.confidence.level === "INSUFFICIENT") return [];

  const types: InsightType[] = [];
  if (growth.state === "IMPROVING" || growth.state === "STRONG" || growth.state === "MASTERED") types.push("IMPROVEMENT");
  if (growth.state === "REGRESSING") types.push("REGRESSION");
  if (growth.state === "STAGNATING") types.push("STAGNATION");
  if (growth.state === "RECOVERING") types.push("RECOVERY");
  if (growth.transferEvidenceCount > 0 && (growth.state === "IMPROVING" || growth.state === "STRONG" || growth.state === "MASTERED")) types.push("TRANSFER_GAIN");
  if (growth.retentionEvidenceCount > 0 && growth.confidence.level !== "LOW") types.push("RETENTION");
  if (growth.independenceTrend === "POSITIVE") types.push("INDEPENDENCE_GAIN");
  if (growth.state === "AT_RISK" || growth.state === "STAGNATING") types.push("DEVELOPMENT_AREA");

  return types.map((type) => ({
    insightId: `${studentId}:${growth.dimension}:${type}:${growth.evidenceCount}`,
    studentId,
    insightType: type,
    dimension: growth.dimension,
    claim: claimFor(type, growth),
    evidenceRefs: growth.supportingEvidenceIds,
    confidence: growth.confidence.level,
    recommendedAction: recommendedAction(type, growth),
    generatedAt: now.toISOString(),
    rulesVersion: RULES_VERSION,
    assessmentSafe: type !== "DEVELOPMENT_AREA", // development-area framing is withheld in assessment mode; see authorization.ts
  }));
}

export function milestoneToInsight(studentId: string, milestone: GrowthMilestone, now: Date = new Date()): GrowthInsight {
  return {
    insightId: `${studentId}:${milestone.milestoneKey}`,
    studentId,
    insightType: "MILESTONE",
    dimension: milestone.dimension,
    claim: `${cap(friendlyDimension(milestone.dimension))} milestone: ${milestone.milestoneType.replace(/_/g, " ").toLowerCase()}.`,
    evidenceRefs: [milestone.sourceEvidenceId],
    confidence: "HIGH", // milestones are binary/triggered, not statistically inferred
    recommendedAction: null,
    generatedAt: now.toISOString(),
    rulesVersion: RULES_VERSION,
    assessmentSafe: true,
  };
}
