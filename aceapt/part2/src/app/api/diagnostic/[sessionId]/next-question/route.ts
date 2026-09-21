import { NextRequest, NextResponse } from "next/server";
import { assertOwnsSession, getDemoStudentId, UnauthorizedError } from "@/lib/auth/demoAuth";
import {
  countPresentations,
  createPresentation,
  getAllSkills,
  getOpenPresentation,
  getQuestion,
  getSession,
  getSessionHistory,
  getValidatedQuestions,
} from "@/lib/db/repo";
import { computeCapabilityState } from "@/lib/domain/capabilityState";
import { evaluateStoppingCondition, MAX_QUESTIONS, MIN_QUESTIONS, selectNextQuestion } from "@/lib/domain/selectionEngine";
import { track } from "@/lib/analytics/track";
import { apiError, NotFoundError } from "@/lib/api/errors";
import type { PublicQuestion, Question } from "@/lib/domain/types";

export async function GET(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError();

    const session = getSession(sessionId);
    if (!session) throw new NotFoundError("Session not found.");
    assertOwnsSession(session.studentId, studentId);

    if (session.status === "COMPLETED") {
      return NextResponse.json({ done: true, reason: "This diagnostic is already complete." });
    }
    if (session.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: `Session is in an unexpected state (${session.status}).` }, { status: 409 });
    }

    // Resume support: if there's an unanswered presentation, hand it back
    // instead of selecting a new one — this is what makes closing the tab
    // and returning safe (spec section 52).
    const skills = getAllSkills();
    const open = getOpenPresentation(sessionId);
    if (open) {
      const question = getQuestion(open.questionId);
      if (!question) throw new NotFoundError("Question referenced by an open presentation is missing.");
      return NextResponse.json({
        done: false,
        presentationId: open.id,
        question: toPublicQuestion(question),
        domain: skills.find((s) => s.id === question.skillNodeId)?.domain ?? null,
        captureConfidence: open.captureConfidence,
        progress: buildProgress(sessionId),
      });
    }

    const allQuestions = getValidatedQuestions();
    const history = getSessionHistory(sessionId);
    const state = computeCapabilityState(sessionId, history, skills);

    const stopping = evaluateStoppingCondition(state, skills, allQuestions.length);
    if (stopping.stop) {
      return NextResponse.json({ done: true, reason: stopping.reason });
    }

    const selected = selectNextQuestion(state, allQuestions, skills);
    if (!selected) {
      return NextResponse.json({ done: true, reason: "No further questions are available." });
    }

    const presentation = createPresentation({
      sessionId,
      questionId: selected.question.id,
      purpose: selected.purpose,
      rationale: selected.rationale,
      sequenceIndex: state.questionsAttempted,
      captureConfidence: selected.captureConfidence,
    });

    track("QUESTION_PRESENTED", sessionId, studentId, { questionId: selected.question.id, purpose: selected.purpose });
    if (selected.purpose === "DIFFICULTY_ESCALATION" || selected.purpose === "DIFFICULTY_REDUCTION") {
      track("DIFFICULTY_CHANGED", sessionId, studentId, { purpose: selected.purpose, difficulty: selected.question.difficulty });
    }

    return NextResponse.json({
      done: false,
      presentationId: presentation.id,
      question: toPublicQuestion(selected.question),
      domain: skills.find((s) => s.id === selected.question.skillNodeId)?.domain ?? null,
      captureConfidence: selected.captureConfidence,
      progress: buildProgress(sessionId),
    });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Never send the answer key, explanation, or internal purpose/rationale to
 * the client during the diagnostic (spec sections 13 and 25 — no tutoring,
 * no leaking internal reasoning).
 */
function toPublicQuestion(q: Question): PublicQuestion {
  const { correctAnswer, explanation, expectedReasoning, commonErrorTypes, validationNotes, ...rest } = q;
  return rest;
}

function buildProgress(sessionId: string) {
  return {
    questionsAttempted: countPresentations(sessionId),
    minQuestions: MIN_QUESTIONS,
    maxQuestions: MAX_QUESTIONS,
  };
}
