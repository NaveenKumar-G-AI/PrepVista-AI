import { NextRequest, NextResponse } from "next/server";
import { assertOwnsSession, getDemoStudentId, UnauthorizedError } from "@/lib/auth/demoAuth";
import {
  getAllSkills,
  getDiagnosticResultJson,
  getOnboardingContext,
  getSession,
  getSessionHistory,
  saveDiagnosticResult,
  updateSessionStatus,
} from "@/lib/db/repo";
import { computeCapabilityState } from "@/lib/domain/capabilityState";
import { ALGORITHM_VERSION, buildDiagnosticResult, SCORING_VERSION } from "@/lib/domain/reportBuilder";
import { generateAiNarrative } from "@/lib/ai/interpretFindings";
import { track } from "@/lib/analytics/track";
import { apiError, NotFoundError } from "@/lib/api/errors";
import { nowIso } from "@/lib/db/client";

/** Read-only fetch of an already-completed result — does not trigger building one. Used by the report page. */
export async function GET(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError();

    const session = getSession(sessionId);
    if (!session) throw new NotFoundError("Session not found.");
    assertOwnsSession(session.studentId, studentId);

    const existingJson = getDiagnosticResultJson(sessionId);
    if (!existingJson) {
      return NextResponse.json({ error: "This diagnostic has not finished yet." }, { status: 409 });
    }
    return NextResponse.json(JSON.parse(existingJson));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const studentId = await getDemoStudentId();
    if (!studentId) throw new UnauthorizedError();

    const session = getSession(sessionId);
    if (!session) throw new NotFoundError("Session not found.");
    assertOwnsSession(session.studentId, studentId);

    // Idempotent: calling complete twice (e.g. a retried request) returns
    // the already-computed result rather than recomputing or erroring.
    const existingJson = getDiagnosticResultJson(sessionId);
    if (existingJson) {
      return NextResponse.json(JSON.parse(existingJson));
    }

    updateSessionStatus(sessionId, "ANALYZING");

    const skills = getAllSkills();
    const history = getSessionHistory(sessionId);
    const state = computeCapabilityState(sessionId, history, skills);
    const onboardingContext = getOnboardingContext(session.onboardingContextId);
    if (!onboardingContext) throw new NotFoundError("Onboarding context not found.");

    // All numbers, evidence levels, root causes, and comparisons are fully
    // computed here, deterministically, before any AI involvement.
    const result = buildDiagnosticResult(session, state, onboardingContext, skills);

    const { narrative, status } = await generateAiNarrative(result);
    result.aiNarrative = narrative;
    result.aiGenerationStatus = status;

    saveDiagnosticResult(sessionId, JSON.stringify(result), status, {
      diagnosticVersion: result.diagnosticVersion,
      scoringVersion: SCORING_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
    });
    updateSessionStatus(sessionId, "COMPLETED", { completedAt: nowIso(), stopReason: "completed" });

    track("DIAGNOSTIC_COMPLETED", sessionId, studentId, { totalQuestions: result.totalQuestions });
    track("REPORT_GENERATED", sessionId, studentId, { aiGenerationStatus: status });

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
