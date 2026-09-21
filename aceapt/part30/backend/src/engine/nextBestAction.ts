import type { ActionType, Bottleneck, Capability, CapabilityDimensions, PathMilestone, PathMode } from "../domain/types.js";
import type { MilestoneEvaluation } from "./milestoneEvidence.js";
import type { CapabilityGap } from "./gapAnalysis.js";

export interface ActionDraft {
  type: ActionType;
  capabilityCode: string;
  milestoneId: string | null;
  priority: number;
  reason: string;
  headline: string;
}

const DIMENSION_ACTION: Record<keyof CapabilityDimensions, (low: boolean) => ActionType> = {
  accuracy: (low) => (low ? "LEARN" : "REVISE"),
  speed: () => "PRACTICE",
  transfer: () => "TRANSFER",
  consistency: () => "RETEST",
};

export const HEADLINES: Record<ActionType, string> = {
  LEARN: "Learn the fundamentals of {cap}.",
  REVISE: "Revise your weaker areas in {cap}.",
  PRACTICE: "Complete a targeted timed challenge in {cap}.",
  RETEST: "Retest {cap} to confirm a stable result.",
  TRANSFER: "Apply {cap} to an unfamiliar problem.",
  SIMULATE: "Run a full exam-condition simulation covering {cap}.",
  PROVE: "Prove your {cap} milestone.",
  REFLECT: "Review what went wrong in {cap} before continuing.",
};

/**
 * Section 12-13. Milestones that already have sufficient evidence
 * (readyToProve) outrank further practice -- converting practice into
 * verified readiness is always the highest-leverage move once it's
 * available (Section 35). Otherwise the action targets the bottleneck's
 * weakest dimension, using the mapping in DIMENSION_ACTION.
 */
export function determineNextBestAction(
  bottleneck: Bottleneck | null,
  milestoneEvaluations: Array<{ milestone: PathMilestone; evaluation: MilestoneEvaluation }>,
  mode: PathMode,
  excludeMilestoneIds: ReadonlySet<string> = new Set(),
  gaps: readonly CapabilityGap[] = [],
  capabilities: readonly Capability[] = []
): ActionDraft | null {
  const readyToProve = milestoneEvaluations
    .filter((m) => m.evaluation.readyToProve && !excludeMilestoneIds.has(m.milestone.id))
    .sort((a, b) => a.milestone.priority - b.milestone.priority)[0];

  if (readyToProve) {
    const cap = readyToProve.milestone.requiredCapabilities[0] ?? readyToProve.milestone.name;
    return {
      type: "PROVE",
      capabilityCode: cap,
      milestoneId: readyToProve.milestone.id,
      priority: 1,
      reason: `Your evidence for "${readyToProve.milestone.name}" now meets its requirements. Proving it converts practice into verified readiness.`,
      headline: HEADLINES.PROVE.replace("{cap}", readyToProve.milestone.name),
    };
  }

  if (!bottleneck) {
    // Section 53: bottleneck is null for two very different reasons -- either
    // every requirement is already met (genuinely nothing to do), or there's
    // an open gap that just doesn't have enough evidence to identify with
    // confidence yet. Only the second case should produce an action, and it
    // must not claim to know which dimension is weak -- it's a baseline
    // assessment, not a targeted fix.
    const openUnevidenced = [...gaps].filter((g) => g.gap > 0.5 && !g.evidenceSufficient).sort((a, b) => b.weight - a.weight)[0];
    if (!openUnevidenced) return null;
    const label = capabilities.find((c) => c.code === openUnevidenced.capabilityCode)?.name ?? openUnevidenced.capabilityCode;
    return {
      type: "PRACTICE",
      capabilityCode: openUnevidenced.capabilityCode,
      milestoneId: null,
      priority: 1,
      reason: `There isn't enough evidence yet on ${label} to identify a specific gap -- a baseline assessment establishes where you actually stand.`,
      headline: `Complete a targeted assessment in ${label}.`,
    };
  }

  const low = bottleneck.currentValue < 40;
  let type = DIMENSION_ACTION[bottleneck.dimension](low);

  // Recovery mode steps back from novel-context pressure (Section 27) --
  // TRANSFER downgrades to REVISE. It deliberately does NOT downgrade
  // PRACTICE: PRACTICE still produces real evidence (including timing
  // data, which is what a speed-dimension bottleneck needs to ever move --
  // see capabilityModel.ts). Routing it to REFLECT instead once produced a
  // dead end, since REFLECT records no evidence: Recovery would trigger,
  // the recommended action would stop generating evidence, readiness would
  // stay flat, and flat readiness keeps re-triggering Recovery forever.
  if (mode === "RECOVERY" && type === "TRANSFER") {
    type = "REVISE";
  }
  // Deep mastery pushes toward transfer/simulation once the basics hold,
  // rather than stopping at "meets the bar".
  if (mode === "DEEP_MASTERY" && type === "REVISE" && bottleneck.currentValue >= 55) {
    type = "TRANSFER";
  }

  return {
    type,
    capabilityCode: bottleneck.capabilityCode,
    milestoneId: null,
    priority: 1,
    reason: bottleneck.explanation,
    headline: HEADLINES[type].replace("{cap}", bottleneck.capabilityName),
  };
}
