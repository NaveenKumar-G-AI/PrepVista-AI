/**
 * REFERENCE ONLY — not compiled or tested in this package (see tsconfig.json
 * "exclude" and vitest's test include glob, neither of which touch this
 * file). It shows how each controller maps to a Next.js App Router route
 * once dropped into your actual CodeForge repo. Split each block below into
 * its own `route.ts` at the indicated path, and swap `getCurrentUser` /
 * `getRepository` / `getProviderChain` for your app's real session and DB
 * wiring — those three are the only integration points.
 *
 * Uses the standard Fetch API Request/Response (what App Router route
 * handlers actually receive/return), so it has no dependency on the `next`
 * package to read.
 */
import {
  createAssessment,
  generateProbe,
  getHistory,
  getResult,
  submitResponse,
  type AssessmentRepository,
} from "@/api/controllers.js";
import { defaultProviderChain } from "@/ai/provider.js";
import type { CurrentUser } from "@/security/index.js";
import type { StudentSubmission } from "@/types/index.js";

declare function getCurrentUser(req: Request): Promise<CurrentUser>;
declare function getRepository(): AssessmentRepository;

const chain = defaultProviderChain();

// ---------------------------------------------------------------------------
// app/api/understanding/assessments/route.ts
// ---------------------------------------------------------------------------
export async function POST_createAssessment(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  const submission = (await req.json()) as StudentSubmission;
  try {
    const result = await createAssessment({ submission, user, chain, repo: getRepository() });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// app/api/understanding/assessments/[id]/probe/route.ts
// ---------------------------------------------------------------------------
export async function POST_generateProbe(req: Request, params: { id: string }): Promise<Response> {
  const user = await getCurrentUser(req);
  try {
    const result = await generateProbe({ assessmentId: params.id, user, chain, repo: getRepository() });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof Error && err.name === "AuthorizationError" ? 403 : 400;
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status });
  }
}

// ---------------------------------------------------------------------------
// app/api/understanding/assessments/[id]/respond/route.ts
// ---------------------------------------------------------------------------
export async function POST_submitResponse(req: Request, params: { id: string }): Promise<Response> {
  const user = await getCurrentUser(req);
  const body = (await req.json()) as { probeId: string; response: string };
  try {
    const result = await submitResponse({
      assessmentId: params.id,
      probeId: body.probeId,
      studentResponseRaw: body.response,
      user,
      chain,
      repo: getRepository(),
    });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof Error && err.name === "AuthorizationError" ? 403 : 400;
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status });
  }
}

// ---------------------------------------------------------------------------
// app/api/understanding/assessments/[id]/result/route.ts
// ---------------------------------------------------------------------------
export async function GET_result(req: Request, params: { id: string }): Promise<Response> {
  const user = await getCurrentUser(req);
  try {
    const result = await getResult({ assessmentId: params.id, user, chain, repo: getRepository() });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof Error && err.name === "AuthorizationError" ? 403 : 400;
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status });
  }
}

// ---------------------------------------------------------------------------
// app/api/understanding/history/route.ts   (?studentId=&challengeId=&limit=&offset=)
// ---------------------------------------------------------------------------
export async function GET_history(req: Request): Promise<Response> {
  const user = await getCurrentUser(req);
  const url = new URL(req.url);
  try {
    const result = await getHistory({
      studentId: url.searchParams.get("studentId") ?? user.id,
      challengeId: url.searchParams.get("challengeId") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 20),
      offset: Number(url.searchParams.get("offset") ?? 0),
      user,
      repo: getRepository(),
    });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof Error && err.name === "AuthorizationError" ? 403 : 400;
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status });
  }
}
