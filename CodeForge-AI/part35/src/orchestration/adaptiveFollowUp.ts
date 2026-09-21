import { DEPTH_LEVELS } from "../domain/types.js";
import type { DepthLevel, StructuredEvaluation, InterviewBlueprint, FollowUpReason } from "../domain/types.js";

export type FollowUpAction = "DEEPER" | "CLARIFICATION" | "VERIFICATION" | "EVIDENCE_CHECK" | "NEW_TOPIC";

export interface FollowUpDecision {
  action: FollowUpAction;
  nextDepthLevel: DepthLevel | null; // null when action === "NEW_TOPIC"
  reason: FollowUpReason | null;
}

export interface FollowUpInput {
  blueprint: InterviewBlueprint;
  currentDepthLevel: DepthLevel;
  /** how many follow-ups have already been asked on THIS topic (resets when questionSelection picks a new skill) */
  followUpsSoFarForTopic: number;
  /** how many times a CLARIFICATION/VERIFICATION has already been tried for the CURRENT question, to prevent infinite loops on one weak answer */
  retriesAtCurrentDepth: number;
  evaluation: StructuredEvaluation;
}

/**
 * §26 — the core adaptive branch. Priority order matters: a potential
 * inconsistency is checked before anything else, even a nominally strong
 * answer, because §21 requires triggering verification rather than trusting
 * a possibly-inconsistent strong-sounding answer at face value.
 */
export function decideFollowUp(input: FollowUpInput): FollowUpDecision {
  const { blueprint, currentDepthLevel, followUpsSoFarForTopic, retriesAtCurrentDepth, evaluation } = input;

  const budgetExhausted = followUpsSoFarForTopic >= blueprint.followUpStrategy.maxFollowUpsPerQuestion;
  const retryBudgetExhausted = retriesAtCurrentDepth >= 1; // one clarification/verification attempt, not an interrogation

  // §21 — potential inconsistency always gets checked, regardless of answer quality.
  if (evaluation.consistency === "POTENTIAL_INCONSISTENCY" && !retryBudgetExhausted && !budgetExhausted) {
    return { action: "EVIDENCE_CHECK", nextDepthLevel: currentDepthLevel, reason: "EVIDENCE_CHECK" };
  }

  // Genuinely uncertain evidence (not necessarily inconsistent) gets one verification pass.
  if (evaluation.consistency === "UNCERTAIN" && !retryBudgetExhausted && !budgetExhausted) {
    return { action: "VERIFICATION", nextDepthLevel: currentDepthLevel, reason: "VERIFICATION" };
  }

  // §32 — an explicit "I don't know" is recorded evidence, not a prompt to interrogate further.
  if (evaluation.answerQuality === "DONT_KNOW") {
    return { action: "NEW_TOPIC", nextDepthLevel: null, reason: null };
  }

  // Weak/partial answers get exactly one clarification, not a repeated grilling.
  if (
    (evaluation.answerQuality === "PARTIALLY_CORRECT" || evaluation.answerQuality === "INSUFFICIENT") &&
    !retryBudgetExhausted &&
    !budgetExhausted
  ) {
    return { action: "CLARIFICATION", nextDepthLevel: currentDepthLevel, reason: "CLARIFICATION" };
  }
  if (evaluation.answerQuality === "INCORRECT") {
    // §51 anti-gaming: don't just move on from a wrong answer without any
    // signal — but also don't interrogate a skill the candidate has already
    // shown a gap in. One clarification, same as partial/insufficient.
    if (!retryBudgetExhausted && !budgetExhausted) {
      return { action: "CLARIFICATION", nextDepthLevel: currentDepthLevel, reason: "CLARIFICATION" };
    }
    return { action: "NEW_TOPIC", nextDepthLevel: null, reason: null };
  }

  // Strong, consistent answer: go deeper along the ladder, unless the topic
  // budget or the ladder itself is exhausted.
  if (evaluation.answerQuality === "CORRECT" || evaluation.answerQuality === "MOSTLY_CORRECT") {
    const nextDepth = nextRung(currentDepthLevel);
    if (budgetExhausted || nextDepth === null) {
      return { action: "NEW_TOPIC", nextDepthLevel: null, reason: null };
    }
    return { action: "DEEPER", nextDepthLevel: nextDepth, reason: "DEEPER" };
  }

  // Fallback (shouldn't normally be reached): move on rather than loop.
  return { action: "NEW_TOPIC", nextDepthLevel: null, reason: null };
}

function nextRung(current: DepthLevel): DepthLevel | null {
  const idx = DEPTH_LEVELS.indexOf(current);
  const next = DEPTH_LEVELS[idx + 1];
  return next ?? null;
}
