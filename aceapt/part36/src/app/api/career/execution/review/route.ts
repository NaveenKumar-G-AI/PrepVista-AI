import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal } from "@/lib/db/repoGoals";
import { getWeeklyReview } from "@/lib/services/weeklyReview";
import { computeMomentum } from "@/lib/services/momentum";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ hasGoal: false });

  const weekParam = request.nextUrl.searchParams.get("week") ?? undefined;
  const review = await getWeeklyReview(userId, goal, weekParam);
  const momentum = computeMomentum(userId);
  return NextResponse.json({ hasGoal: true, review, momentum });
});
