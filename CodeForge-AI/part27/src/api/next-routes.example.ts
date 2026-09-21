import { getGrowthProfile, getSkillProgression, getSkillHistory, getGrowthTimeline, getMilestones, getGrowthSnapshot, getRoleGrowth, getGrowthEvidence, getGrowthInsights } from './handlers.js';
import { UnauthorizedError } from './authorization.js';
import { getRequestContext } from './request-context.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Illustrative Next.js App Router wiring for all 9 operations in section
 * 55. In your actual repo these become nine separate `route.ts` files (the
 * comment above each function gives the intended path); they're combined
 * into one file here to avoid scaffolding nine near-empty directories in a
 * standalone package. Each function's logic — auth, param extraction,
 * calling into handlers.ts, JSON response — is exactly what belongs in
 * the real file, so copy-paste-and-rename is the whole integration step.
 *
 * These use the standard Fetch API Request/Response types (already
 * available via this project's "DOM" lib) rather than importing
 * next/server, so this package has no dependency on Next.js itself. In
 * your real app, swap Request -> NextRequest and Response.json(...) ->
 * NextResponse.json(...) from 'next/server' — the bodies are unchanged.
 */

function errorResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    return Response.json({ error: err.message }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return Response.json({ error: message }, { status: 500 });
}

function studentIdFromRequest(request: Request, requestingUserId: string): string {
  // Defaults to "self"; an instructor may override via ?studentId=... —
  // safe because every handler below re-checks authorization server-side
  // regardless of what the client claims (section 97).
  return new URL(request.url).searchParams.get('studentId') ?? requestingUserId;
}

// app/api/growth/profile/route.ts — export as `GET`
export async function GET_growthProfile(request: Request): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const profile = await getGrowthProfile(studentId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(profile);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/skills/[skillId]/progression/route.ts — export as `GET`
export async function GET_skillProgression(request: Request, { params }: { params: { skillId: string } }): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const points = await getSkillProgression(studentId, params.skillId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(points);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/skills/[skillId]/history/route.ts — export as `GET`
export async function GET_skillHistory(request: Request, { params }: { params: { skillId: string } }): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const history = await getSkillHistory(studentId, params.skillId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(history);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/timeline/route.ts — export as `GET`
export async function GET_growthTimeline(request: Request): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const url = new URL(request.url);
    const since = url.searchParams.get('since') ?? undefined;
    const skillId = url.searchParams.get('skillId') ?? undefined;
    const timeline = await getGrowthTimeline(studentId, ctx.requestingUserId, ctx.repo, ctx.authz, { since, skillId });
    return Response.json(timeline);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/milestones/route.ts — export as `GET`
export async function GET_milestones(request: Request): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const milestones = await getMilestones(studentId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(milestones);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/snapshot/route.ts — export as `GET`
export async function GET_growthSnapshot(request: Request): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const snapshot = await getGrowthSnapshot(studentId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(snapshot);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/role/[roleId]/route.ts — export as `GET`
export async function GET_roleGrowth(request: Request, { params }: { params: { roleId: string } }): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    // TODO(integration): pass your real skillId -> GrowthCategory adapter here instead of undefined.
    const view = await getRoleGrowth(studentId, params.roleId, ctx.requestingUserId, ctx.repo, ctx.authz, undefined);
    return Response.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/skills/[skillId]/evidence/route.ts — export as `GET`
export async function GET_growthEvidence(request: Request, { params }: { params: { skillId: string } }): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const evidence = await getGrowthEvidence(studentId, params.skillId, ctx.requestingUserId, ctx.repo, ctx.authz);
    return Response.json(evidence);
  } catch (err) {
    return errorResponse(err);
  }
}

// app/api/growth/insights/route.ts — export as `GET`
export async function GET_growthInsights(request: Request): Promise<Response> {
  try {
    const ctx = await getRequestContext(request);
    const studentId = studentIdFromRequest(request, ctx.requestingUserId);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? growthRules.timeWindows.recentDays);
    const now = new Date();
    const start = new Date(now.getTime() - days * 86_400_000);
    const insight = await getGrowthInsights(studentId, ctx.requestingUserId, ctx.repo, ctx.authz, {
      window: { label: 'recent', startTimestamp: start.toISOString(), endTimestamp: now.toISOString() },
    });
    return Response.json(insight);
  } catch (err) {
    return errorResponse(err);
  }
}
