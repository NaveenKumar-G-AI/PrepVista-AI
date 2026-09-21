import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/apiHandler";
import { requireUserId } from "@/lib/auth";
import { getActiveGoal, listMilestones, getCurrentWeeklyObjective, listCapabilities } from "@/lib/db/repoGoals";
import { listCandidateActions, listActionsByStatus } from "@/lib/db/repoActions";
import { listRecentAdjustments } from "@/lib/db/repoPlanning";
import { currentWeekStart, daysAgoIso } from "@/lib/services/dates";

export const GET = withApi(async (request: NextRequest) => {
  const userId = requireUserId(request);
  const goal = getActiveGoal(userId);
  if (!goal) return NextResponse.json({ hasGoal: false });

  const milestones = listMilestones(goal.id);
  const activeMilestone = milestones.find((m) => m.status === "ACTIVE") ?? milestones[0] ?? null;
  const weeklyObjective = activeMilestone ? getCurrentWeeklyObjective(activeMilestone.id, currentWeekStart()) ?? null : null;

  const candidates = listCandidateActions(userId, goal.id).sort(
    (a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999)
  );
  const inProgress = listActionsByStatus(userId, ["STARTED"]).filter((a) => a.goalId === goal.id);
  const recentlyCompleted = listActionsByStatus(userId, ["SELF_REPORTED_COMPLETE", "VERIFIED_COMPLETE", "MEASURED", "IMPROVED"])
    .filter((a) => a.goalId === goal.id)
    .slice(0, 8);

  const capabilities = listCapabilities(userId, goal.id);
  const adjustments = listRecentAdjustments(userId, daysAgoIso(30)).slice(0, 10);

  return NextResponse.json({
    hasGoal: true,
    goal,
    milestones,
    activeMilestone,
    weeklyObjective,
    capabilities,
    candidates,
    inProgress,
    recentlyCompleted,
    adjustments,
  });
});
