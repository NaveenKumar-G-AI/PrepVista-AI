/**
 * ============================================================================
 * DEMO ONLY — not part of the Hint Ladder deliverable.
 * ============================================================================
 * This route does NOT execute student code (building a real sandboxed code
 * execution system is explicitly out of scope — see README "What's a
 * stand-in vs. the real deliverable"). It lets the demo workspace page
 * record a SIMULATED execution result the person picks from a dropdown,
 * purely so the Hint Ladder has something real to react to when there's no
 * live CodeForge execution pipeline attached. In the real repo, the actual
 * execution system calls the equivalent of `adapter.recordSubmission(...)`
 * when a real submission finishes running — this route is what that
 * integration point stands in for here.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server-client";
import { DemoExistingSystemsAdapter } from "@/lib/stand-ins/existing-systems-adapter";

export const runtime = "nodejs";

// Re-exported accessor so this route shares the exact same singleton
// instance production-deps.ts hands to the Hint Ladder service — without
// this, "submitting" here wouldn't be visible to the hint routes.
import { __getDemoAdapterForDemoRouteOnly } from "@/lib/hint-ladder/production-deps";

const BodySchema = z.object({
  problemId: z.string().min(1),
  code: z.string().max(20_000),
  simulatedVerdict: z.enum(["WRONG_ANSWER", "ACCEPTED", "RUNTIME_ERROR", "COMPILE_ERROR", "TIMEOUT"]),
  simulatedTestsPassed: z.number().int().min(0).max(10),
});

export async function POST(req: NextRequest) {
  const studentId = await getAuthenticatedUserId();
  if (!studentId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid demo submission." }, { status: 400 });
  }

  const adapter: DemoExistingSystemsAdapter = __getDemoAdapterForDemoRouteOnly();
  const submissionId = `demo-sub-${Date.now()}`;

  adapter.recordSubmission(
    studentId,
    parsed.data.problemId,
    { submissionId, code: parsed.data.code, language: "python", createdAt: new Date().toISOString() },
    {
      submissionId,
      verdict: parsed.data.simulatedVerdict,
      testsPassed: parsed.data.simulatedVerdict === "ACCEPTED" ? 10 : parsed.data.simulatedTestsPassed,
      testsTotal: 10,
      compilerError: parsed.data.simulatedVerdict === "COMPILE_ERROR" ? "SyntaxError: invalid syntax" : null,
      runtimeError: parsed.data.simulatedVerdict === "RUNTIME_ERROR" ? "IndexError: list index out of range" : null,
      stackTrace: parsed.data.simulatedVerdict === "RUNTIME_ERROR" ? `File "solution.py", line 3, in solve\n    IndexError: list index out of range` : null,
      failingPublicCases: null,
      createdAt: new Date().toISOString(),
    }
  );

  return NextResponse.json({ ok: true, submissionId });
}
