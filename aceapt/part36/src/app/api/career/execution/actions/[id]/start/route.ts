import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActionById, markStarted } from "@/lib/db/repoActions";
import { createSession } from "@/lib/db/repoExecution";
import { logEvent } from "@/lib/db/repoPlanning";
import { buildPhases } from "@/lib/services/sessionPlanner";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const userId = requireUserId(request);
  const { id } = await params;

  const action = getActionById(userId, id);
  if (!action) return NextResponse.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const requestedMinutes = Number(body.minutes);
  const minutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? Math.round(requestedMinutes) : action.estimatedMinutes;

  const phases = buildPhases(action.actionType, minutes);
  const session = createSession(userId, action.id, minutes, phases);

  markStarted(userId, action.id);
  logEvent(userId, "ACTION_STARTED", { actionId: action.id });
  logEvent(userId, "SESSION_STARTED", { actionId: action.id, sessionId: session.id, minutes });

  return NextResponse.json({ action: getActionById(userId, action.id), session });
});
