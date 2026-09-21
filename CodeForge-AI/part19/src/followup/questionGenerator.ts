import type { Claim, Contradiction, ContradictionCategory, FollowUpQuestion, FollowUpType } from "../types.js";

const CATEGORY_TO_FOLLOWUP: Partial<Record<ContradictionCategory, FollowUpType>> = {
  ALGORITHM_MISMATCH: "WHY_THIS_ALGORITHM",
  DATA_STRUCTURE_MISMATCH: "WHY_THIS_DATA_STRUCTURE",
  IMPLEMENTATION_DECISION_MISMATCH: "WHY_THIS_DATA_STRUCTURE",
  CONTROL_FLOW_MISMATCH: "WHAT_DOES_THIS_LOOP_MAINTAIN",
  COMPLEXITY_MISMATCH: "WHY_IS_THIS_COMPLEXITY",
  SPACE_COMPLEXITY_MISMATCH: "WHY_IS_THIS_COMPLEXITY",
  EDGE_CASE_MISMATCH: "WHAT_HAPPENS_ON_THIS_EDGE_CASE",
  INVARIANT_MISMATCH: "WHAT_DOES_THIS_LOOP_MAINTAIN",
  CORRECTNESS_REASONING_MISMATCH: "WHY_IS_THIS_BRANCH_REQUIRED",
  BEHAVIOR_MISMATCH: "WHAT_WOULD_BREAK_IF_REMOVED",
  PROBLEM_UNDERSTANDING_MISMATCH: "WHY_THIS_ALGORITHM",
};

const TEMPLATES: Record<FollowUpType, (evidence: string) => string> = {
  WHY_THIS_ALGORITHM: (e) => `${e} Walk through why this approach fits the problem — what would go wrong with a simpler one here?`,
  WHY_THIS_DATA_STRUCTURE: (e) => `${e} What specifically does this data structure give you that a plainer one wouldn't?`,
  WHAT_DOES_THIS_LOOP_MAINTAIN: (e) => `${e} What is true every time this loop finishes an iteration — what does it maintain?`,
  WHY_DOES_THIS_POINTER_MOVE: (e) => `${e} Why does this pointer move when it does, and what would break if it moved earlier or later?`,
  WHY_IS_THIS_COMPLEXITY: (e) => `${e} Walk through exactly where the work comes from, step by step.`,
  WHAT_HAPPENS_ON_THIS_EDGE_CASE: (e) => `${e} Trace through this exact input by hand — what does your code actually do?`,
  WHY_IS_THIS_BRANCH_REQUIRED: (e) => `${e} What input would behave incorrectly if this branch were removed?`,
  WHAT_WOULD_BREAK_IF_REMOVED: (e) => `${e} What would break if this were removed or changed?`,
};

/**
 * Generates targeted follow-ups from actual contradictions first (highest
 * severity first — `contradictions` is already sorted that way), then, if
 * there's room left under `maxQuestions`, flags CORE claim types that are
 * entirely absent from the reasoning (a student who never mentions
 * complexity at all is a "forgot to mention" signal worth asking about,
 * distinct from a claim that was made and found wrong).
 */
export function generateFollowUpQuestions(claims: Claim[], contradictions: Contradiction[], maxQuestions = 3): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];

  for (const c of contradictions) {
    if (questions.length >= maxQuestions) break;
    const type = CATEGORY_TO_FOLLOWUP[c.category] ?? "WHY_IS_THIS_BRANCH_REQUIRED";
    questions.push({
      type,
      question: TEMPLATES[type](c.actualEvidence || c.explanation),
      targetClaimId: c.claimId,
      sourceLocation: c.sourceLocation,
    });
  }

  if (questions.length < maxQuestions && !claims.some((c) => c.claimType === "COMPLEXITY")) {
    questions.push({
      type: "WHY_IS_THIS_COMPLEXITY",
      question: "You didn't mention time complexity at all — what would you say it is, and why?",
      targetClaimId: null,
      sourceLocation: null,
    });
  }
  if (questions.length < maxQuestions && !claims.some((c) => c.claimType === "ALGORITHM")) {
    questions.push({
      type: "WHY_THIS_ALGORITHM",
      question: "You didn't name the approach you used — what would you call it, and why does it fit this problem?",
      targetClaimId: null,
      sourceLocation: null,
    });
  }

  return questions.slice(0, maxQuestions);
}
