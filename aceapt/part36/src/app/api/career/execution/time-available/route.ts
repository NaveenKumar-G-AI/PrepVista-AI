import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { planForMinutes } from "@/lib/services/timeAvailable";

export const POST = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ error: "NO_ACTIVE_GOAL" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const minutes = Number(body.minutes);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
    return NextResponse.json({ error: "INVALID_MINUTES" }, { status: 400 });
  }

  const plan = await planForMinutes(userId, goal, Math.round(minutes));
  return NextResponse.json({ plan });
});
