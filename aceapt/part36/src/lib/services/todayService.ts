import { getActiveGoal, getCurrentBottleneck } from "../db/repoGoals";
import { getCurrentPrimary, listSupporting } from "../db/repoActions";
import { listUpcomingOpportunities } from "../db/repoPlanning";
import { refreshRecommendations } from "./recommendation";
import { computeMomentum } from "./momentum";
import { getTimeBudget } from "./timeBudget";
import { computePlanHealth } from "./planHealth";
import type { ActionItem, CareerGoal, CapabilityArea, Opportunity } from "../types";
import type { MomentumResult } from "./momentum";
import type { TimeBudgetResult } from "./timeBudget";
import type { PlanHealthResult } from "./planHealth";

export type TodayView =
  | { hasGoal: false }
  | {
      hasGoal: true;
      goal: CareerGoal;
      bottleneck: CapabilityArea | null;
      primary: ActionItem | null;
      supporting: ActionItem[];
      momentum: MomentumResult;
      timeBudget: TimeBudgetResult;
      opportunities: Opportunity[];
      health: PlanHealthResult;
    };

export async function getTodayView(userId: string): Promise<TodayView> {
  const goal = getActiveGoal(userId);
  if (!goal) return { hasGoal: false };

  let primary = getCurrentPrimary(userId, goal.id) ?? null;
  let supporting: ActionItem[];

  if (!primary) {
    const result = await refreshRecommendations(userId, goal);
    primary = result.primary?.action ?? null;
    supporting = result.supporting.map((r) => r.action);
  } else {
    supporting = listSupporting(userId, goal.id);
  }

  return {
    hasGoal: true,
    goal,
    bottleneck: getCurrentBottleneck(userId, goal.id) ?? null,
    primary,
    supporting,
    momentum: computeMomentum(userId),
    timeBudget: getTimeBudget(userId, goal),
    opportunities: listUpcomingOpportunities(userId).slice(0, 3),
    health: computePlanHealth(userId, goal),
  };
}
