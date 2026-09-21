import { NextRequest, NextResponse } from "next/server";
import { getStudentIdFromHeaders } from "@/lib/session";
import { completeOnboarding, getOrGenerateSummary } from "@/lib/onboarding/service";

export async function POST(request: NextRequest) {
  const studentId = getStudentIdFromHeaders(request.headers);
  if (!studentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await completeOnboarding(studentId);
    // Generation happens server-side, with a deterministic fallback baked into
    // getOrGenerateSummary — this call cannot itself fail the request (spec section 36).
    const summary = await getOrGenerateSummary(studentId);
    return NextResponse.json({ context: { ...context, summary }, summary });
  } catch (err) {
    console.error("[api/onboarding/complete POST]", err);
    return NextResponse.json(
      { error: "Couldn't finish setting up your starting context. Please try again." },
      { status: 500 },
    );
  }
}
