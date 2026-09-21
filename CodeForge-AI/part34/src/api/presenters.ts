// ============================================================================
// Phase 57 — "Do not expose hidden scoring logic" in the student UI.
// Phase 65 — the frontend is never authoritative for score/evidence/
// confidence/mastery/gap state; the backend derives it. The corollary this
// file enforces is narrower but just as important: the backend must not
// even SEND a student live scoring internals to render, or the frontend
// becomes a de facto leak of "hidden" logic regardless of who computed it.
//
// STUDENT actors get the trimmed view during an active interview. TRAINER /
// TPO_ADMIN / ORG_ADMIN / SYSTEM_ADMIN get the full record — Phase 58/59
// UIs are explicitly allowed to show evidence confidence, verified skills,
// etc. after completion, and staff roles reviewing a session need the real
// data.
// ============================================================================

import type { ActorContext, Evaluation, InterviewSession, Question } from "../domain/types.js";

function isStaff(actor: ActorContext): boolean {
  return actor.roles.some((r) => r !== "STUDENT");
}

export interface PublicQuestion {
  id: string;
  text: string;
  skillId: string;
  isFollowUp: boolean;
}

export function toPublicQuestion(question: Question): PublicQuestion {
  // Deliberately omits: difficulty, origin, groundedIn, validation details,
  // followUpTrigger — none of that should shape how a student answers.
  return { id: question.id, text: question.text, skillId: question.skillId, isFollowUp: question.isFollowUp };
}

export interface PublicSubmitResult {
  responseId: string;
  status: Evaluation["status"];
}

export function toPublicSubmitResult(evaluation: Evaluation, actor: ActorContext): PublicSubmitResult | Evaluation {
  if (isStaff(actor)) return evaluation; // staff reviewing/monitoring a session see the full evaluation
  // A student never sees correctness, confidence, or the adaptive signal
  // live — that's exactly the "hidden scoring logic" Phase 57 protects.
  return { responseId: evaluation.responseId, status: evaluation.status };
}

export interface PublicSessionView {
  id: string;
  state: InterviewSession["state"];
  mode: InterviewSession["mode"];
  roleId: string;
  questionsAskedCount: number;
  currentQuestionId?: string;
}

export function toPublicSession(session: InterviewSession, actor: ActorContext): PublicSessionView | InterviewSession {
  if (isStaff(actor)) return session; // full coverage map, version info, etc.
  return {
    id: session.id,
    state: session.state,
    mode: session.mode,
    roleId: session.roleId,
    questionsAskedCount: session.questionIds.length,
    currentQuestionId: session.currentQuestionId,
  };
}
