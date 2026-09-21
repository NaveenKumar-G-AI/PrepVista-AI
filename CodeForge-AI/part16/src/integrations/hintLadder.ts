import type { CorrectnessAssessment } from "../domain/types.js";

/**
 * Feature boundary (per spec): "The correctness engine identifies and
 * structures the issue. The Hint Ladder decides how much assistance to
 * provide." This module only produces the structured finding — it has no
 * concept of hint levels, progressive disclosure, or student pacing. Your
 * existing Hint Ladder consumes `HintLadderFinding[]` and applies its own
 * policy for how much to reveal.
 */
export interface HintLadderFinding {
  category: "boundary" | "duplicate-values" | "negative-values" | "large-input" | "general";
  observedFact: string;
  hypothesis: string;
  confidence: string;
  requirementId: string | null;
}

const TAG_TO_CATEGORY: Record<string, HintLadderFinding["category"]> = {
  boundary: "boundary",
  empty: "boundary",
  "single-element": "boundary",
  "duplicate-values": "duplicate-values",
  "negative-values": "negative-values",
  "large-n": "large-input",
};

export function toHintLadderFindings(assessment: CorrectnessAssessment): HintLadderFinding[] {
  return assessment.deterministic.clusters.map((cluster) => {
    const category = cluster.sharedTags.map((t) => TAG_TO_CATEGORY[t]).find(Boolean) ?? "general";
    const relatedRequirement = assessment.requirementCoverage.find((rc) =>
      cluster.sharedTags.some((tag) => rc.requirement.relatedTags.includes(tag))
    );
    return {
      category,
      observedFact: cluster.observedFact,
      hypothesis: cluster.hypothesis,
      confidence: assessment.confidence,
      requirementId: relatedRequirement?.requirement.id ?? null,
    };
  });
}
