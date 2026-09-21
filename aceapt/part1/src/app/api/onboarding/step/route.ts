import { NextRequest, NextResponse } from "next/server";
import { getStudentIdFromHeaders } from "@/lib/session";
import { saveStepAnswer } from "@/lib/onboarding/service";
import { stepValueSchemas, isKnownStep } from "@/lib/onboarding/validation";
import { getNextStepId, getResumeStepId } from "@/lib/onboarding/flow";

export async function PATCH(request: NextRequest) {
  const studentId = getStudentIdFromHeaders(request.headers);
  if (!studentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsedBody = body as { stepId?: string; value?: unknown } | null;
  const stepId = parsedBody?.stepId;

  if (!stepId || !isKnownStep(stepId)) {
    return NextResponse.json({ error: `Unknown or missing step id.` }, { status: 400 });
  }

  const schema = stepValueSchemas[stepId];
  const parsed = schema.safeParse(parsedBody?.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That answer didn't look right — please try again.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const { context, isEdit } = await saveStepAnswer(studentId, stepId, parsed.data);
    const nextStepId = isEdit ? null : getNextStepId(stepId, context);
    return NextResponse.json({ context, nextStepId, resumeStepId: getResumeStepId(context), isEdit });
  } catch (err) {
    console.error("[api/onboarding/step PATCH]", err);
    // Nothing prior is lost — only this step's save failed, and the client keeps the student's
    // local selection so they can just retry (spec section 35: no full-progress data loss).
    return NextResponse.json(
      { error: "Couldn't save that answer. Your earlier answers are safe — please try again." },
      { status: 500 },
    );
  }
}
