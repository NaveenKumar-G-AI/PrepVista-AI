import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { buildRequestScopedDeps } from "@/lib/hint-ladder/production-deps";
import { handleHintRequest } from "@/lib/hint-ladder/service";
import { httpStatusForError, RateLimitError } from "@/lib/hint-ladder/errors";

export const runtime = "nodejs";

const RequestBodySchema = z.object({
  // requestId is client-generated (uuid) for idempotency, but if it's
  // missing or malformed we generate one server-side rather than reject
  // the request outright — the only thing that breaks is double-tap
  // deduplication for THIS specific call, not correctness.
  requestId: z.string().min(1).max(100).optional(),
  problemId: z.string().min(1).max(200),
  action: z.enum(["REQUEST_HELP", "REQUEST_DEEPER", "REQUEST_SOLUTION"]),
  studentResponse: z
    .object({
      type: z.enum(["QUICK_ACTION", "FREE_TEXT"]),
      value: z.string().max(2000),
    })
    .optional(),
  // NOTE: intentionally no `mode` field accepted here — mode is always
  // resolved server-side from the existing systems adapter (see
  // service.ts step 3). Accepting a client-supplied mode would let a
  // student self-upgrade an ASSESSMENT attempt to PRACTICE-level hints.
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { deps, studentId } = await buildRequestScopedDeps();
    const response = await handleHintRequest({
      deps,
      studentId,
      input: {
        requestId: parsed.data.requestId ?? randomUUID(),
        problemId: parsed.data.problemId,
        action: parsed.data.action,
        studentResponse: parsed.data.studentResponse,
      },
    });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const status = httpStatusForError(err);
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitError) headers["Retry-After"] = String(Math.ceil(err.retryAfterMs / 1000));

    // Failure isolation: an AI/provider/DB error here must never look
    // like a crash of the editor/submission flow to the client — it's
    // scoped to "the hint request specifically failed", with a message
    // safe to show as-is (never includes provider errors, stack traces,
    // or secrets).
    const message = status === 500 ? "Hint generation is temporarily unavailable. Your code and submissions are unaffected." : (err as Error).message;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
