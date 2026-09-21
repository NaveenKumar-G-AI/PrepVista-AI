import type { ComparatorContext, ConsistencyDimension, DimensionResult } from "../../types";
import { makeFinding, unknownResult } from "../scoring";

/**
 * Fallback used for PROBLEM_ALIGNMENT, CONTROL_FLOW_ALIGNMENT,
 * BEHAVIOUR_ALIGNMENT, IMPLEMENTATION_DECISION_ALIGNMENT, and
 * OPTIMIZATION_ALIGNMENT in this build.
 *
 * These five dimensions are fully wired into the pipeline (they produce
 * valid DimensionResult objects and participate correctly in the claim
 * graph, scoring, and reconciliation flow) but this build doesn't yet have
 * dedicated fact adapters for them, so there is nothing deterministic to
 * compare a claim against. Rather than guess with a crude keyword-overlap
 * heuristic against no evidence — which the spec explicitly forbids
 * ("If evidence cannot be established, mark it UNVERIFIED... Never guess.")
 * — this honestly reports INSUFFICIENT_EVIDENCE. Wire a real fact source
 * into ImplementationModel and give each of these its own comparator
 * (following the pattern in complexity.ts / dataStructure.ts / etc.) to
 * move them out of this fallback.
 */
export async function compareGeneric(dimension: ConsistencyDimension, ctx: ComparatorContext): Promise<DimensionResult> {
  const claims = ctx.studentModel.claimsByDimension[dimension] ?? [];
  if (claims.length === 0) return unknownResult(dimension, `Student made no claims tagged to ${dimension}.`);

  const claimText = claims.map((c) => c.text).join(" ");
  return {
    dimension,
    alignment: "UNKNOWN",
    score: null,
    confidence: 0.2,
    evidenceStrength: "INSUFFICIENT",
    findings: [
      makeFinding({
        dimension,
        severity: "LOW",
        evidenceStrength: "INSUFFICIENT",
        confidence: 0.2,
        summary: `A claim was made for ${dimension}, but this build doesn't have a dedicated fact source wired in for it yet — add one to get a real verdict instead of INSUFFICIENT_EVIDENCE.`,
        studentClaim: claimText,
      }),
    ],
  };
}
