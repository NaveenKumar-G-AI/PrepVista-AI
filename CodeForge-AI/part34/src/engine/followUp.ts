// ============================================================================
// Phase 20 — "Follow-up questions must be generated from the previous
// response... Follow-ups should increase depth rather than repeat the same
// question."
// Phase 22 — "Do not ask unlimited questions. Stop when sufficient evidence
// has been collected."
//
// This module decides IF a follow-up should happen and, if so, what extra
// context (the parent question + response + adaptive signal) should shape
// it. The actual question text still goes through generateQuestion() in
// questionGeneration.ts — a follow-up is a Question like any other, just
// with isFollowUp=true and a parentQuestionId, and it goes through the exact
// same validation.
// ============================================================================

import type { AdaptiveSignal, Question, Response } from "../domain/types.js";

export interface FollowUpDecisionInput {
  adaptiveSignal: AdaptiveSignal;
  followUpConfig: { adaptiveEnabled: boolean; maxFollowUpDepthPerSkill: number };
  currentDepthForSkill: number; // how many follow-ups already asked on this skill in this session
}

export interface FollowUpDecision {
  shouldAskFollowUp: boolean;
  reason: string;
}

export function decideFollowUp(input: FollowUpDecisionInput): FollowUpDecision {
  if (!input.followUpConfig.adaptiveEnabled) {
    return { shouldAskFollowUp: false, reason: "Adaptive follow-ups are disabled for this blueprint." };
  }
  if (input.currentDepthForSkill >= input.followUpConfig.maxFollowUpDepthPerSkill) {
    return { shouldAskFollowUp: false, reason: "Max follow-up depth reached for this skill (Phase 22 bound)." };
  }

  switch (input.adaptiveSignal) {
    case "STRONG":
      return { shouldAskFollowUp: true, reason: "Strong response — probing deeper per Phase 21." };
    case "WEAK":
      return { shouldAskFollowUp: true, reason: "Weak response — asking a simpler clarification per Phase 21." };
    case "UNCERTAIN":
      return { shouldAskFollowUp: true, reason: "Uncertain response — gathering additional evidence per Phase 21." };
    case "CONTRADICTION":
      return { shouldAskFollowUp: true, reason: "Potential inconsistency — asking a verification question per Phase 21." };
  }
}

/**
 * Builds the extra instruction context appended to grounding for a follow-up
 * generation call, so the follow-up is actually shaped by what came before
 * rather than being an independent question that happens to share a skill.
 */
export function buildFollowUpPromptHint(parentQuestion: Question, parentResponse: Response, signal: AdaptiveSignal): string {
  const priorQuestion = truncate(parentQuestion.text, 160);
  switch (signal) {
    case "STRONG":
      return `The previous question was: "${priorQuestion}". The student answered well: "${truncate(parentResponse.content)}". Ask a deeper follow-up that raises the difficulty — a trade-off, an edge case, or a "what if" extension of their answer. Do not repeat the original question.`;
    case "WEAK":
      return `The previous question was: "${priorQuestion}". The student struggled: "${truncate(parentResponse.content)}". Ask a simpler, more concrete clarification question on the same underlying concept — narrower in scope, not harder.`;
    case "UNCERTAIN":
      return `The previous question was: "${priorQuestion}". The student's answer was inconclusive: "${truncate(parentResponse.content)}". Ask a question that would produce clearer evidence one way or the other — a specific scenario is better than a repeat of the abstract question.`;
    case "CONTRADICTION":
      return `The previous question was: "${priorQuestion}". The student's answer may conflict with the verified evidence: "${truncate(parentResponse.content)}". Ask a neutral, non-accusatory question that would help clarify — for example, asking them to walk through the specific part in question, without implying they were wrong or dishonest.`;
  }
}

function truncate(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
