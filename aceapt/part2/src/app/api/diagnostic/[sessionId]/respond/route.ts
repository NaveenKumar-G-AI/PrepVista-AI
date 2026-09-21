import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertOwnsSession, getDemoStudentId, UnauthorizedError } from "@/lib/auth/demoAuth";
import { createResponse, getPresentation, getQuestion, getResponseByPresentation, getSession } from "@/lib/db/repo";
import { track } from "@/lib/analytics/track";
import { apiError, NotFoundError } from "@/lib/api/errors";

const InputSchema = z.object({
  presentationId: z.string().min(1),
  status: z.enum(["ANSWERED", "SKIPPED", "TIMED_OUT", "DONT_KNOW"]),
  studentAnswer: z.string().max(500).nullable().optional(),
  confidenceLevel: z.enum(["GUESSING", "NOT_SURE", "SOMEWHAT_CONFIDENT", "CONFIDENT", "VERY_CONFIDENT"]).nullable().optional(),
  questionStartedAt: z.string(),
  questionAnsweredAt: z.string(),
});

/**
 * Deliberately does NOT tell the client whether the answer was correct.
 * The spec forbids showing hints/solutions/explanations *during* the
 * diagnostic (section 25, "no tutoring") — immediate right/wrong feedback
 * sits in the same gray area (it can change how a student approaches the
 * next question, which taints what's being measured) and standard adaptive
 * testing avoids it for the same reason. Every result is revealed together
 * in the final report.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const body = InputSchema.parse(await req.json());
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError();

    const session = getSession(sessionId);
    if (!session) throw new NotFoundError("Session not found.");
    assertOwnsSession(session.studentId, studentId);

    // Idempotency: a retried network request for an already-answered
    // presentation returns success without double-counting (spec section 53).
    const existing = getResponseByPresentation(body.presentationId);
    if (existing) {
      return NextResponse.json({ received: true, idempotent: true });
    }

    const presentation = getPresentation(body.presentationId);
    if (!presentation || presentation.sessionId !== sessionId) {
      throw new NotFoundError("Presentation not found for this session.");
    }
    const question = getQuestion(presentation.questionId);
    if (!question) throw new NotFoundError("Question not found.");

    // Correctness is always computed server-side against the stored answer
    // key — the client's own belief about correctness is never trusted.
    const isCorrect =
      body.status === "ANSWERED" && body.studentAnswer ? body.studentAnswer === question.correctAnswer : null;

    const startedMs = Date.parse(body.questionStartedAt);
    const answeredMs = Date.parse(body.questionAnsweredAt);
    const responseDurationMs =
      Number.isFinite(startedMs) && Number.isFinite(answeredMs) ? Math.max(0, answeredMs - startedMs) : 0;

    createResponse({
      sessionId,
      presentationId: body.presentationId,
      questionId: question.id,
      status: body.status,
      studentAnswer: body.studentAnswer ?? null,
      isCorrect,
      confidenceLevel: body.confidenceLevel ?? null,
      questionStartedAt: body.questionStartedAt,
      questionAnsweredAt: body.questionAnsweredAt,
      responseDurationMs,
    });

    track(body.status === "SKIPPED" ? "QUESTION_SKIPPED" : "QUESTION_ANSWERED", sessionId, studentId, {
      questionId: question.id,
      status: body.status,
    });
    if (body.confidenceLevel) {
      track("CONFIDENCE_CAPTURED", sessionId, studentId, { questionId: question.id, confidenceLevel: body.confidenceLevel });
    }

    return NextResponse.json({ received: true, idempotent: false });
  } catch (err) {
    return apiError(err);
  }
}
