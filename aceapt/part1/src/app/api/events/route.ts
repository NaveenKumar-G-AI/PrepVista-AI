import { NextRequest, NextResponse } from "next/server";
import { getStudentIdFromHeaders } from "@/lib/session";
import { logEvent } from "@/lib/onboarding/service";
import { eventPayloadSchema } from "@/lib/onboarding/validation";

export async function POST(request: NextRequest) {
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

  const parsed = eventPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Analytics is best-effort by nature — a malformed beacon shouldn't be treated as a hard
    // failure the client needs to retry, but we still don't silently accept unknown shapes.
    return NextResponse.json({ error: "Invalid event payload." }, { status: 422 });
  }

  try {
    await logEvent(studentId, parsed.data.type, parsed.data.metadata ?? {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/events POST]", err);
    return NextResponse.json({ error: "Could not record event." }, { status: 500 });
  }
}
