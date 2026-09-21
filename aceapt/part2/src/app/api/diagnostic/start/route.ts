import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDemoStudentId, UnauthorizedError } from "@/lib/auth/demoAuth";
import { createSession, getOnboardingContext } from "@/lib/db/repo";
import { track } from "@/lib/analytics/track";
import { apiError, NotFoundError } from "@/lib/api/errors";

const InputSchema = z.object({ onboardingContextId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { onboardingContextId } = InputSchema.parse(await req.json());
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError("No student identity found — start from onboarding first.");

    const context = getOnboardingContext(onboardingContextId);
    if (!context) throw new NotFoundError("Onboarding context not found.");
    if (context.studentId !== studentId) throw new UnauthorizedError();

    const session = createSession({
      studentId,
      onboardingContextId: context.id,
      onboardingContextVersion: context.version,
    });

    track("DIAGNOSTIC_STARTED", session.id, studentId, { onboardingContextId });

    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    return apiError(err);
  }
}
