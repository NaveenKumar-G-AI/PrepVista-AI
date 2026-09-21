import { NextRequest, NextResponse } from "next/server";
import { getStudentIdFromHeaders } from "@/lib/session";
import { getStudentOnboardingContext } from "@/lib/onboarding/service";

export async function GET(request: NextRequest) {
  const studentId = getStudentIdFromHeaders(request.headers);
  if (!studentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getStudentOnboardingContext(studentId);
    return NextResponse.json({ context });
  } catch (err) {
    console.error("[api/onboarding GET]", err);
    return NextResponse.json({ error: "Could not load your progress. Please try again." }, { status: 500 });
  }
}
