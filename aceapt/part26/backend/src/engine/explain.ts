import { CandidateAction, ExpectedValueBand, NextActionExplanation } from "../types";
import { enhanceExplanation } from "../ai/client";

const ACTION_LABEL: Record<string, string> = {
  LEARN: "Concept walkthrough",
  REVIEW: "Prerequisite review",
  RECALL: "Retention repair",
  PRACTICE: "Focused practice",
  TRANSFER_CHALLENGE: "Transfer challenge",
  METHOD_REPAIR: "Method repair",
  VERIFY: "Quick verification",
  MIX: "Mixed verification",
  CHALLENGE: "Stretch challenge",
  TIMED_PRACTICE: "Timed practice",
  ASSESS: "Assessment",
  REST: "Break"
};

function expectedValueBand(priorityScore: number): ExpectedValueBand {
  if (priorityScore >= 0.6) return "HIGH";
  if (priorityScore >= 0.35) return "MEDIUM";
  return "LOW";
}

/**
 * Section 31: every recommendation answers WHAT / WHY / TIME / EXPECTED
 * VALUE. This is always computed from the candidate's own rationale and
 * numbers - never invented copy - so it stays true even if the optional AI
 * rewrite (below) is unavailable.
 */
export function buildDeterministicExplanation(candidate: CandidateAction): NextActionExplanation {
  const label = ACTION_LABEL[candidate.actionType] ?? candidate.actionType;
  const why = candidate.rationale.join(" ");

  return {
    what: `${label} - ${candidate.topicName}`,
    why: why || "Selected as the highest-value use of your time right now.",
    time: `${candidate.estimatedMinutes} min`,
    expectedValue: expectedValueBand(candidate.priorityScore),
    source: "deterministic"
  };
}

/**
 * Tries to have Claude rewrite the deterministic explanation in warmer,
 * more natural language. The prompt explicitly forbids introducing any new
 * numbers or claims - it may only reword what's already true (section 38:
 * AI assists with wording, it never controls the decision). Falls back to
 * the deterministic version untouched if no API key is configured or the
 * call fails for any reason, so the feature works identically either way.
 */
export async function buildExplanation(candidate: CandidateAction): Promise<NextActionExplanation> {
  const deterministic = buildDeterministicExplanation(candidate);
  const enhancedWhy = await enhanceExplanation(deterministic);
  if (!enhancedWhy) return deterministic;
  return { ...deterministic, why: enhancedWhy, source: "ai-enhanced" };
}
