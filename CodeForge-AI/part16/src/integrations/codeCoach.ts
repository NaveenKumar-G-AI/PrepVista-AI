import type { CorrectnessAssessment } from "../domain/types.js";

/**
 * The exact structured shape the spec asks the Code Coach to be able to
 * consume: correctness_status, confidence, evidence, failure_cluster,
 * root_cause, affected_area, requirement_status, regression, next_action.
 *
 * This module does NOT duplicate Code Coach — it's a pure projection
 * function from CorrectnessAssessment to this signal shape. Wire your
 * existing Code Coach to call `toCodeCoachSignal(assessment)` and consume
 * the result; nothing here owns conversation state, prompting, or UI.
 */
export interface CodeCoachCorrectnessSignal {
  correctnessStatus: string;
  confidence: string;
  evidence: Array<{ summary: string; testIds: string[] }>;
  failureCluster: { tags: string[]; hypothesis: string } | null;
  rootCause: { layer: string; description: string } | null;
  affectedArea: string | null;
  requirementStatus: Array<{ requirementId: string; status: string }>;
  regression: boolean;
  nextAction: string | null;
}

export function toCodeCoachSignal(assessment: CorrectnessAssessment): CodeCoachCorrectnessSignal {
  const topCluster = assessment.deterministic.clusters[0] ?? null;
  const affectedRegion = assessment.ai.result?.rootCause?.affectedRegions[0];

  return {
    correctnessStatus: assessment.status,
    confidence: assessment.confidence,
    evidence: assessment.deterministic.clusters.map((c) => ({ summary: c.observedFact, testIds: c.testIds })),
    failureCluster: topCluster ? { tags: topCluster.sharedTags, hypothesis: topCluster.hypothesis } : null,
    rootCause: assessment.ai.result?.rootCause
      ? { layer: assessment.ai.result.rootCause.layer, description: assessment.ai.result.rootCause.description }
      : null,
    affectedArea: affectedRegion
      ? `${affectedRegion.file ?? assessment.ref.language} line ${affectedRegion.startLine}`
      : null,
    requirementStatus: assessment.requirementCoverage.map((rc) => ({
      requirementId: rc.requirement.id,
      status: rc.status,
    })),
    regression: assessment.delta?.regression ?? false,
    nextAction: assessment.ai.result?.recommendedNextAction ?? null,
  };
}
