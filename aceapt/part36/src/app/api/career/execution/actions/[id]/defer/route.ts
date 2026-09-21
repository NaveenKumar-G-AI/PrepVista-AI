import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActionById, markDeferred } from "@/lib/db/repoActions";
import { logEvent } from "@/lib/db/repoPlanning";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { refreshRecommendations } from "@/lib/services/recommendation";
import type { DeferReasonCode } from "@/lib/types";

const VALID_REASONS: DeferReasonCode[] = [
  "TIME_UNAVAILABLE",
  "PRIORITY_CHANGED",
  "TASK_DIFFICULT",
  "TASK_UNCLEAR",
  "OPPORTUNITY_CHANGED",
  "PERSONAL_SCHEDULE",
];

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const userId = requireUserId(request);
  const { id } = await params;

  const action = getActionById(userId, id);
  if (!action) return NextResponse.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const reasonCode: DeferReasonCode = VALID_REASONS.includes(body.reasonCode) ? body.reasonCode : "PERSONAL_SCHEDULE";

  markDeferred(userId, action.id, reasonCode);
  logEvent(userId, "ACTION_DEFERRED", { actionId: action.id, reasonCode });

  const goal = getActiveGoal(userId);
  const next = goal ? await refreshRecommendations(userId, goal) : { primary: null, supporting: [] };

  return NextResponse.json({
    action: getActionById(userId, action.id),
    nextPrimary: next.primary?.action ?? null,
  });
});
