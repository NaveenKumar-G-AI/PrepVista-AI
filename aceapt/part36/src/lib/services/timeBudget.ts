import { listActionsByStatus } from "../db/repoActions";
import { getTimeAvailability, upsertTimeAvailability } from "../db/repoPlanning";
import { listCapabilities } from "../db/repoGoals";
import { currentWeekStart } from "./dates";
import type { CareerGoal } from "../types";

export interface TimeBudgetCategory {
  name: string;
  minutes: number;
}

export interface TimeBudgetResult {
  weekStart: string;
  availableMinutes: number | null;
  allocatedMinutes: number;
  remainingMinutes: number | null;
  categories: TimeBudgetCategory[];
}

export function getTimeBudget(userId: string, goal: CareerGoal): TimeBudgetResult {
  const weekStart = currentWeekStart();
  const availableMinutes = getTimeAvailability(userId, weekStart) ?? null;

  const openActions = listActionsByStatus(userId, ["NOT_STARTED", "STARTED", "DEFERRED"]).filter(
    (a) => a.goalId === goal.id
  );
  const allocatedMinutes = openActions.reduce((sum, a) => sum + a.estimatedMinutes, 0);

  const capabilities = listCapabilities(userId, goal.id);
  const nameById = new Map(capabilities.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, number>();
  for (const a of openActions) {
    const label = (a.capabilityAreaId && nameById.get(a.capabilityAreaId)) || "General preparation";
    byCategory.set(label, (byCategory.get(label) ?? 0) + a.estimatedMinutes);
  }
  const categories = Array.from(byCategory.entries())
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    weekStart,
    availableMinutes,
    allocatedMinutes,
    remainingMinutes: availableMinutes != null ? availableMinutes - allocatedMinutes : null,
    categories,
  };
}

export function setWeeklyAvailability(userId: string, minutes: number): void {
  upsertTimeAvailability(userId, currentWeekStart(), Math.max(0, minutes));
}
