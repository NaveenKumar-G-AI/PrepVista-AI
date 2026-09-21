import { NextRequest, NextResponse } from "next/server";
import { assertOwnsSession, getDemoStudentId, UnauthorizedError } from "@/lib/auth/demoAuth";
import { countPresentations, getOpenPresentation, getSession } from "@/lib/db/repo";
import { apiError, NotFoundError } from "@/lib/api/errors";

export async function GET(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError();

    const session = getSession(sessionId);
    if (!session) throw new NotFoundError("Session not found.");
    assertOwnsSession(session.studentId, studentId);

    return NextResponse.json({
      status: session.status,
      questionsAttempted: countPresentations(sessionId),
      hasOpenPresentation: !!getOpenPresentation(sessionId),
    });
  } catch (err) {
    return apiError(err);
  }
}
