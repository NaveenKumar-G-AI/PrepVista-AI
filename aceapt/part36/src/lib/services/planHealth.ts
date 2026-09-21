import { listActionsByStatus, listCandidateActions } from "../db/repoActions";
import { listUpcomingOpportunities, getTimeAvailability } from "../db/repoPlanning";
import { countBlockersByReasonSince } from "../db/repoExecution";
import { getCurrentBottleneck } from "../db/repoGoals";
import { currentWeekStart, daysAgoIso, daysUntil } from "./dates";
import type { CareerGoal, PlanHealthState, BlockerReasonCode } from "../types";

export type FrictionType =
  | "TASK_TOO_LARGE"
  | "TASK_TOO_VAGUE"
  | "TASK_TOO_DIFFICULT"
  | "TIME_CONFLICT"
  | "DEADLINE_CONFLICT"
  | "MISSING_PREREQUISITE"
  | "TOO_MANY_ACTIONS";

const REASON_TO_FRICTION: Partial<Record<BlockerReasonCode, FrictionType>> = {
  TOO_DIFFICULT: "TASK_TOO_DIFFICULT",
  DONT_UNDERSTAND: "TASK_TOO_VAGUE",
  NO_TIME: "TIME_CONFLICT",
  MISSING_PREREQUISITE: "MISSING_PREREQUISITE",
};

export interface PlanHealthResult {
  state: PlanHealthState;
  reasons: string[];
  friction: FrictionType[];
}

export function computePlanHealth(userId: string, goal: CareerGoal): PlanHealthResult {
  const reasons: string[] = [];
  const blocked = listActionsByStatus(userId, ["BLOCKED"]);
  const candidates = listCandidateActions(userId, goal.id);
  const completedEver = listActionsByStatus(userId, [
    "SELF_REPORTED_COMPLETE",
    "VERIFIED_COMPLETE",
    "MEASURED",
    "IMPROVED",
  ]);

  const weekStart = currentWeekStart();
  const availableMinutes = getTimeAvailability(userId, weekStart);
  const startedOrOpen = listActionsByStatus(userId, ["NOT_STARTED", "STARTED"]);
  const allocatedMinutes = startedOrOpen.reduce((sum, a) => sum + a.estimatedMinutes, 0);

  const opportunities = listUpcomingOpportunities(userId);
  const bottleneck = getCurrentBottleneck(userId, goal.id);
  const soonOpportunity = opportunities.find((o) => o.eventDate && daysUntil(o.eventDate) <= 3 && daysUntil(o.eventDate) >= 0);

  const friction = computeFriction(userId);

  if (blocked.length > 0) {
    reasons.push(`${blocked.length} action${blocked.length > 1 ? "s" : ""} currently blocked`);
    return { state: "BLOCKED", reasons, friction };
  }

  if (completedEver.length < 2 && candidates.length <= 1) {
    reasons.push("Not enough execution history yet to assess plan health");
    return { state: "INSUFFICIENT_DATA", reasons, friction };
  }

  if (soonOpportunity && (!bottleneck || bottleneck.trend === "UNKNOWN" || bottleneck.trend === "DECLINING")) {
    reasons.push(`${soonOpportunity.title} is coming up and readiness signal is still ${bottleneck?.trend?.toLowerCase() ?? "unknown"}`);
    return { state: "DEADLINE_RISK", reasons, friction };
  }

  if (availableMinutes != null && allocatedMinutes > availableMinutes) {
    reasons.push(`Open actions total ${allocatedMinutes}m against ${availableMinutes}m available this week`);
    return { state: "OVERLOADED", reasons, friction };
  }

  if (friction.length > 0) {
    reasons.push("Recurring friction detected in recent actions");
    return { state: "NEEDS_ADJUSTMENT", reasons, friction };
  }

  reasons.push("Actions are being completed and evidence is coming in as expected");
  return { state: "ON_TRACK", reasons, friction };
}

function computeFriction(userId: string): FrictionType[] {
  const since = daysAgoIso(14);
  const counts = countBlockersByReasonSince(userId, since);
  const found = new Set<FrictionType>();
  for (const row of counts) {
    if (row.c >= 2) {
      const mapped = REASON_TO_FRICTION[row.reason_code as BlockerReasonCode];
      if (mapped) found.add(mapped);
    }
  }
  return Array.from(found);
}
