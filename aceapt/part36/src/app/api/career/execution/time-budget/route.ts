import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { getTimeBudget, setWeeklyAvailability } from "@/lib/services/timeBudget";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ hasGoal: false });
  return NextResponse.json({ hasGoal: true, budget: getTimeBudget(userId, goal) });
});

export const POST = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ error: "NO_ACTIVE_GOAL" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const minutes = Number(body.availableMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return NextResponse.json({ error: "INVALID_MINUTES" }, { status: 400 });
  }

  setWeeklyAvailability(userId, minutes);
  return NextResponse.json({ budget: getTimeBudget(userId, goal) });
});
