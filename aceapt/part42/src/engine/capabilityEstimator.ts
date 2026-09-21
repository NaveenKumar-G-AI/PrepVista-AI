import type { Blueprint, BlueprintNode, CapabilityStatus, DiagnosticConfidenceState, SkillEstimate } from "../types/domain.js";
import { descendantSkills, nodeById } from "./blueprint.js";

export interface SkillEvidencePoint {
  isCorrect: boolean | null; // null = skip, contributes no weight either way
  evidenceWeight: number; // 0..1, from evidenceQuality.ts
}

const PRIOR_MEAN = 0.5;
const PRIOR_STRENGTH = 2; // weakly informative — ~2 pseudo-observations at 0.5

/**
 * Deliberately flat priors at every level (no shrinkage toward the parent
 * node's estimate). A hierarchical-shrinkage prior would converge faster
 * with sparse evidence, but it's an extra modeling assumption this build
 * can't validate against real ACEAPT data in this session — see
 * TRUTH_TABLE.md. Flat priors are simpler to explain to a student
 * ("we started neutral and updated on your evidence") and to test.
 */
export function estimateFromEvidence(
  evidence: SkillEvidencePoint[],
  priorMean = PRIOR_MEAN,
  priorStrength = PRIOR_STRENGTH,
): { pointEstimate: number; weightedEvidence: number; rawCount: number } {
  const countable = evidence.filter((e) => e.isCorrect !== null);
  const weightedCorrect = countable.filter((e) => e.isCorrect).reduce((s, e) => s + e.evidenceWeight, 0);
  const weightedTotal = countable.reduce((s, e) => s + e.evidenceWeight, 0);
  const pointEstimate = (priorStrength * priorMean + weightedCorrect) / (priorStrength + weightedTotal);
  return { pointEstimate, weightedEvidence: weightedTotal, rawCount: countable.length };
}

/** Module 11 — how much to trust the estimate, independent of what it says. */
export function deriveConfidenceState(
  rawCount: number,
  minEvidenceCount: number,
  consistencyFlag: boolean,
): DiagnosticConfidenceState {
  if (rawCount === 0) return "incomplete";
  if (consistencyFlag) return "conflicted";
  if (rawCount < minEvidenceCount) return "low";
  if (rawCount < minEvidenceCount * 2) return "moderate";
  return "high";
}

/** Module 23 — student-friendly bands. Never "bad at X" — see explainability.ts for copy. */
export function deriveStatus(pointEstimate: number, confidenceState: DiagnosticConfidenceState): CapabilityStatus {
  if (confidenceState === "incomplete") return "insufficient_evidence";
  if (pointEstimate >= 0.8) return "strong";
  if (pointEstimate >= 0.6) return "solid";
  if (pointEstimate >= 0.4) return "developing";
  return "needs_focus";
}

export function estimateNode(
  blueprint: Blueprint,
  node: BlueprintNode,
  evidenceBySkill: Map<string, SkillEvidencePoint[]>,
  consistencyFlagBySkill: Map<string, boolean>,
): SkillEstimate {
  const leaves = descendantSkills(blueprint, node.id);
  const pooled = leaves.flatMap((leaf) => evidenceBySkill.get(leaf.id) ?? []);
  const consistencyFlag = leaves.some((leaf) => consistencyFlagBySkill.get(leaf.id) === true);

  const { pointEstimate, weightedEvidence, rawCount } = estimateFromEvidence(pooled);
  const confidenceState = deriveConfidenceState(rawCount, node.minEvidenceCount, consistencyFlag);
  const status = deriveStatus(pointEstimate, confidenceState);

  return {
    skillNodeId: node.id,
    nodeLevel: node.level,
    nodeCode: node.code,
    nodeLabel: node.label,
    parentNodeId: node.parentNodeId,
    pointEstimate: Number(pointEstimate.toFixed(4)),
    status,
    confidenceState,
    evidenceCount: rawCount,
    weightedEvidence: Number(weightedEvidence.toFixed(3)),
    consistencyFlag,
  };
}

/** Estimates every node in the blueprint in one pass. */
export function estimateAllNodes(
  blueprint: Blueprint,
  evidenceBySkill: Map<string, SkillEvidencePoint[]>,
  consistencyFlagBySkill: Map<string, boolean>,
): SkillEstimate[] {
  return blueprint.nodes.map((node) => estimateNode(blueprint, node, evidenceBySkill, consistencyFlagBySkill));
}

export function estimateSingleSkillById(
  blueprint: Blueprint,
  skillNodeId: string,
  evidenceBySkill: Map<string, SkillEvidencePoint[]>,
  consistencyFlagBySkill: Map<string, boolean>,
): SkillEstimate | null {
  const node = nodeById(blueprint, skillNodeId);
  if (!node) return null;
  return estimateNode(blueprint, node, evidenceBySkill, consistencyFlagBySkill);
}
