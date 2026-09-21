/**
 * Reference Next.js App Router handlers for the coaching API.
 *
 * ILLUSTRATIVE ONLY — not part of the type-checked `src/` package (it
 * imports `next/server`, which isn't installed here on purpose, since no
 * real Next.js app exists in this workspace). Split into real files at:
 *   app/api/coach/session/route.ts             -> export as POST
 *   app/api/coach/session/[id]/history/route.ts -> export as GET
 *   app/api/coach/message/route.ts              -> export as POST
 * and replace every commented-out import with your real modules.
 */
import { NextRequest, NextResponse } from "next/server";
// import { createServerSupabaseClient } from "@/lib/supabase/server";
// import { getProblem } from "@/lib/problems";
// import { getLatestExecutionResult } from "@/lib/execution";

import { buildCoachingContext } from "../src/context/contextBuilder";
import { runCoachEngine } from "../src/engine/coachEngine";
import { ProviderRouter } from "../src/providers/providerRouter";
import { GroqProvider } from "../src/providers/groqProvider";
import { GeminiProvider } from "../src/providers/geminiProvider";
import { ConsoleTelemetrySink } from "../src/telemetry/telemetry";
import { RateLimiter, InMemoryRateLimitStore, isDuplicateRequest, hashRequest } from "../src/rateLimit/rateLimiter";
import { SupabaseCoachRepository } from "../src/db/repository";
import type { CoachingPolicyMode } from "../src/types";

const providerRouter = new ProviderRouter([new GroqProvider(), new GeminiProvider()]);
const telemetry = new ConsoleTelemetrySink();
const rateLimiter = new RateLimiter(new InMemoryRateLimitStore(), { maxRequests: 20, windowMs: 60_000 });

async function getAuthedUser(_req: NextRequest): Promise<{ id: string } | null> {
  // const supabase = createServerSupabaseClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // return user ? { id: user.id } : null;
  return null; // BLOCKED here — replace with your real auth helper.
}

export async function createSession(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { problemId, policyMode } = (await req.json()) as { problemId: string; policyMode: CoachingPolicyMode };
  const repo = new SupabaseCoachRepository({} as any /* pass your real Supabase client */);
  const session = await repo.createSession({ studentId: user.id, problemId, policyMode });
  return NextResponse.json({ sessionId: session.id });
}

export async function getHistory(req: NextRequest, sessionId: string) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const repo = new SupabaseCoachRepository({} as any);
  const session = await repo.getSession(sessionId, user.id); // ownership check — never trust a client-supplied id alone
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const history = await repo.getHistory(sessionId);
  return NextResponse.json({ messages: history });
}

export async function sendMessage(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimiter.check(user.id);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await req.json();
  const { sessionId, problemId, code, language, requestedMode, studentQuestion } = body;

  if (isDuplicateRequest(hashRequest(sessionId, requestedMode, studentQuestion, code))) {
    return NextResponse.json({ error: "duplicate_request" }, { status: 429 });
  }

  const repo = new SupabaseCoachRepository({} as any);
  const session = await repo.getSession(sessionId, user.id);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // const problem = await getProblem(problemId);
  // const execution = await getLatestExecutionResult({ problemId, userId: user.id });
  const state = (await repo.getState(sessionId)) ?? {
    sessionId,
    coachingDepth: 1,
    previousHints: [],
    previousObservations: [],
    unresolvedIssues: [],
    resolvedIssues: [],
  };

  const ctx = buildCoachingContext({
    problem: { id: problemId, title: "REPLACE_WITH_REAL_PROBLEM", statement: "REPLACE", constraints: [], publicExamples: [] },
    code: { language, source: code },
    latestExecution: null, // REPLACE: map your execution record into RawExecutionResult, or leave null if none yet
    history: [],
    state,
    request: { requestedMode, studentQuestion },
    policyMode: session.policyMode,
  });

  const provider = providerRouter.pick(requestedMode === "DEEP_EXPLANATION" ? "complex_reasoning" : "simple_explanation");
  const result = await runCoachEngine(ctx, { provider, telemetry });

  await repo.appendMessage({ sessionId, role: "student", content: studentQuestion ?? `[${requestedMode}]` });
  if (result.response) {
    await repo.appendMessage({
      sessionId,
      role: "coach",
      content: result.response.observation,
      meta: {
        response_type: result.response.response_type,
        confidence: result.response.confidence,
        coaching_level: result.response.coaching_level,
        code_locations: result.response.code_locations,
      },
    });
    await repo.saveState(sessionId, { ...state, coachingDepth: result.response.coaching_level });
  }

  // Never the raw DB row, never the raw model output — only this sanitized shape.
  return NextResponse.json({
    responseType: result.response?.response_type,
    observation: result.response?.observation,
    concept: result.response?.concept,
    codeLocations: result.response?.code_locations,
    confidence: result.response?.confidence,
    coachingLevel: result.response?.coaching_level,
    nextQuestion: result.response?.next_question,
    correlationId: result.correlationId,
  });
}
