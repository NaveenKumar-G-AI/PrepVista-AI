import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActionById, markCompleted } from "@/lib/db/repoActions";
import { getLatestSessionForAction } from "@/lib/db/repoExecution";
import { logEvent } from "@/lib/db/repoPlanning";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { finishSessionAndCalibrate } from "@/lib/services/evidenceService";
import { recheckPrerequisite } from "@/lib/services/blockerService";
import { refreshRecommendations } from "@/lib/services/recommendation";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const userId = requireUserId(request);
  const { id } = await params;

  const action = getActionById(userId, id);
  if (!action) return NextResponse.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actualMinutes = Number(body.actualMinutes);

  const session = getLatestSessionForAction(userId, action.id);
  if (session && !session.endedAt) {
    finishSessionAndCalibrate(
      userId,
      session.id,
      action.id,
      Number.isFinite(actualMinutes) && actualMinutes > 0 ? Math.round(actualMinutes) : session.plannedMinutes
    );
  }

  markCompleted(userId, action.id, "SELF_REPORTED_COMPLETE");
  logEvent(userId, "ACTION_COMPLETED", { actionId: action.id });
  if (session) logEvent(userId, "SESSION_COMPLETED", { actionId: action.id, sessionId: session.id });

  if (action.parentActionId) {
    recheckPrerequisite(userId, action.parentActionId);
  }

  const goal = getActiveGoal(userId);
  const next = goal ? await refreshRecommendations(userId, goal) : { primary: null, supporting: [] };

  return NextResponse.json({
    action: getActionById(userId, action.id),
    nextPrimary: next.primary?.action ?? null,
  });
});
