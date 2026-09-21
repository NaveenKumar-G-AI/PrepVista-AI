import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { getWeeklyReview } from "@/lib/services/weeklyReview";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ hasGoal: false });

  const review = await getWeeklyReview(userId, goal);
  return NextResponse.json({
    hasGoal: true,
    capabilityChanges: review.capabilityChanges,
    adjustments: review.adjustments,
    planHealth: review.planHealth,
  });
});
