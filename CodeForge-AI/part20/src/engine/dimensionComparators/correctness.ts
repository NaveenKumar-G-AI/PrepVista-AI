import type { ComparatorContext, DimensionResult } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";

/**
 * This comparator is where the product's central distinction lives:
 * "your implementation works" is NOT the same claim as "your explanation
 * accurately describes why it works." Passing tests is strong evidence the
 * CODE is correct; it says nothing about whether the student's ARGUMENT for
 * correctness holds up. So this comparator reads ALGORITHM_ALIGNMENT (which
 * must run first — see DIMENSION_ORDER in consistencyEngine.ts) and caps the
 * correctness-argument score when the algorithm claim doesn't match the
 * implementation, even though execution evidence is positive.
 */
export async function compareCorrectness(ctx: ComparatorContext): Promise<DimensionResult> {
  const dim = "CORRECTNESS_ALIGNMENT" as const;
  const exec = ctx.implementationModel.executionSummary;
  const claimTexts = ctx.studentModel.claimsByDimension.CORRECTNESS_ALIGNMENT.map((c) => c.text);

  if (!exec) return unknownResult(dim, "No execution evidence available to verify correctness claims.");

  const testsPass = exec.allVisibleTestsPassed && (exec.allHiddenTestsPassed ?? true);
  if (!testsPass) {
    const confidence = 0.9;
    return {
      dimension: dim,
      alignment: "MISMATCH",
      score: scoreFromAlignment("MISMATCH", confidence),
      confidence,
      evidenceStrength: "DIRECT",
      findings: [
        makeFinding({
          dimension: dim,
          severity: "CRITICAL",
          evidenceStrength: "DIRECT",
          confidence,
          summary: "The implementation does not pass all tests, so any correctness argument isn't currently supported by execution evidence.",
        }),
      ],
    };
  }

  const algorithmResult = ctx.resultsSoFar.ALGORITHM_ALIGNMENT;
  if (algorithmResult?.alignment === "MISMATCH") {
    const confidence = 0.75;
    return {
      dimension: dim,
      alignment: "PARTIAL",
      score: scoreFromAlignment("PARTIAL", confidence),
      confidence,
      evidenceStrength: "MODERATE",
      findings: [
        makeFinding({
          dimension: dim,
          severity: "HIGH",
          evidenceStrength: "MODERATE",
          confidence,
          summary:
            "Your implementation passes the tests, but your correctness argument relies on a mechanism that the algorithm-alignment check found doesn't match the implementation. Passing tests confirms the code works — it doesn't confirm your explanation of why it works.",
          studentClaim: claimTexts.join(" ") || undefined,
        }),
      ],
    };
  }

  if (claimTexts.length === 0) {
    const confidence = 0.5;
    return {
      dimension: dim,
      alignment: "PARTIAL",
      score: scoreFromAlignment("PARTIAL", confidence),
      confidence,
      evidenceStrength: "WEAK",
      findings: [
        makeFinding({
          dimension: dim,
          severity: "MEDIUM",
          evidenceStrength: "WEAK",
          confidence,
          summary: "Tests pass, but the student gave no explicit correctness argument to verify.",
        }),
      ],
    };
  }

  return { dimension: dim, alignment: "MATCH", score: 92, confidence: 0.8, evidenceStrength: "STRONG", findings: [] };
}
