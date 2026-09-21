import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { computePlanHealth } from "@/lib/services/planHealth";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ hasGoal: false });
  return NextResponse.json({ hasGoal: true, health: computePlanHealth(userId, goal) });
});
