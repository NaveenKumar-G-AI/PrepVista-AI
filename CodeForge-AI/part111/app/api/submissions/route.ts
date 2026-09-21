import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "../../../lib/http/auth";
import { getPool } from "../../../lib/db/pool";
import { evaluateSubmission } from "../../../lib/engine/evaluate-submission";
import { toSafeResult } from "../../../lib/engine/safe-result";
import type { EvaluationPolicy } from "../../../lib/engine/types";

const SubmitSchema = z.object({
  problemId: z.string().uuid(),
  language: z.enum(["python3", "node"]),
  sourceCode: z.string().min(1).max(200_000),
  idempotencyKey: z.string().min(1).max(200),
  assessmentMode: z.enum(["learning", "practice", "assessment", "interview"]).default("practice"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await resolveSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { problemId, language, sourceCode, idempotencyKey, assessmentMode } = parsed.data;

  const pool = getPool("service");

  // Authorization: does the problem exist and have a published version?
  // Never trust a client-supplied problem_version_id — resolve it
  // server-side from the problem's current published version.
  const { rows: problemRows } = await pool.query(
    `select p.id, p.current_problem_version_id
     from public.problems p
     where p.id = $1 and p.status = 'published'`,
    [problemId]
  );
  const problem = problemRows[0];
  if (!problem || !problem.current_problem_version_id) {
    return NextResponse.json({ error: "problem not found" }, { status: 404 });
  }

  // Idempotency: client-provided key, scoped per-student by a unique
  // constraint (see 0003_submission_schema.sql). A retried request with
  // the same key reuses the existing submission instead of creating a
  // duplicate — this is a real DB-level guarantee, not just app logic.
  const existing = await pool.query(
    `select id from public.submissions where student_id = $1 and idempotency_key = $2`,
    [session.userId, idempotencyKey]
  );

  let submissionId: string;
  if (existing.rows[0]) {
    submissionId = existing.rows[0].id;
  } else {
    const inserted = await pool.query(
      `insert into public.submissions (student_id, problem_id, problem_version_id, language, source_code, status, idempotency_key)
       values ($1,$2,$3,$4,$5,'queued',$6) returning id`,
      [session.userId, problemId, problem.current_problem_version_id, language, sourceCode, idempotencyKey]
    );
    submissionId = inserted.rows[0].id;
  }

  const policy: EvaluationPolicy = {
    earlyTermination: "none",
    criticalCategories: [],
    assessmentMode,
  };

  try {
    const { result } = await evaluateSubmission({ pool, submissionId, policy });
    const safe = toSafeResult(submissionId, "completed", result, policy);
    return NextResponse.json(safe, { status: 200 });
  } catch (err) {
    // Never leak internal error detail to the client — see
    // ERROR MESSAGES in the spec / docs/ARCHITECTURE.md#anti-leakage.
    console.error("evaluation failed:", err);
    return NextResponse.json(
      {
        submissionId,
        status: "error",
        overallVerdict: "JUDGE_ERROR",
        message:
          "The evaluation service could not complete this submission. Your code was not marked incorrect. Please retry.",
      },
      { status: 200 }
    );
  }
}
