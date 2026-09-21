import type { EvidenceTrace, SkillEstimate } from "../types/domain.js";

export interface EvidenceTraceResponsePoint {
  isCorrect: boolean | null;
  durationMs: number;
  expectedDurationMs: number;
  confidence?: number;
}

/** Module 23: never "you are bad at X." */
export function buildConclusionSentence(estimate: SkillEstimate): string {
  const label = estimate.nodeLabel;
  switch (estimate.status) {
    case "strong":
      return `${label} is one of your strengths right now.`;
    case "solid":
      return `${label} looks solid.`;
    case "developing":
      return `${label} is currently one of your development areas.`;
    case "needs_focus":
      return `${label} currently needs more practice.`;
    case "insufficient_evidence":
      return `We don't have enough evidence yet to assess ${label}.`;
  }
}

/** Module 24/40: state what's actually observed; when there's too little to say anything, say that plainly. */
export function buildSupportingEvidence(estimate: SkillEstimate, responses: EvidenceTraceResponsePoint[]): string[] {
  const countable = responses.filter((r) => r.isCorrect !== null);

  if (estimate.confidenceState === "incomplete" || countable.length === 0) {
    return ["We need more evidence to confidently identify the reason."];
  }

  const lines: string[] = [];
  const correct = countable.filter((r) => r.isCorrect).length;
  lines.push(`${countable.length} questions answered independently, ${correct} correct and ${countable.length - correct} incorrect.`);

  const slowFraction =
    countable.filter((r) => r.expectedDurationMs > 0 && r.durationMs / r.expectedDurationMs > 1.5).length / countable.length;
  if (slowFraction > 0.4) {
    lines.push("Response time ran above expected on several of these.");
  }

  const highConfidenceWrong = countable.filter((r) => !r.isCorrect && (r.confidence ?? 0) >= 4).length;
  if (highConfidenceWrong > 0) {
    lines.push(`${highConfidenceWrong} incorrect response(s) came with high stated confidence.`);
  }

  if (estimate.consistencyFlag) {
    lines.push("Performance varied noticeably between attempts rather than trending in one direction.");
  }

  if (estimate.confidenceState === "low") {
    lines.push("This is an early read — more independent evidence would sharpen it.");
  }

  return lines;
}

export function buildEvidenceTrace(estimate: SkillEstimate, responses: EvidenceTraceResponsePoint[]): EvidenceTrace {
  return {
    conclusion: buildConclusionSentence(estimate),
    supportingEvidence: buildSupportingEvidence(estimate, responses),
    confidence: estimate.confidenceState,
  };
}
