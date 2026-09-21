import { getCurrentBottleneck } from "../db/repoGoals";
import { listCandidateActions } from "../db/repoActions";
import { listUpcomingOpportunities, getPreferences } from "../db/repoPlanning";
import { rankActions } from "./priorityEngine";
import { buildSequenceForMinutes, bestSingleActionForMinutes, buildPhases } from "./sessionPlanner";
import { ensureActionSupply } from "./actionCompiler";
import type { CareerGoal, ActionItem, ExecutionSessionPhase } from "../types";

export interface TimePlanItem {
  action: ActionItem;
  offsetMin: number;
  sessionMinutes: number;
  condensed: boolean;
  phases: ExecutionSessionPhase[];
}

export interface TimePlanResult {
  mode: "sequence" | "condensed" | "none";
  items: TimePlanItem[];
  totalMinutes: number;
}

export async function planForMinutes(userId: string, goal: CareerGoal, minutes: number): Promise<TimePlanResult> {
  await ensureActionSupply(userId, goal);

  const candidates = listCandidateActions(userId, goal.id);
  const bottleneck = getCurrentBottleneck(userId, goal.id);
  const opportunities = listUpcomingOpportunities(userId);
  const prefs = getPreferences(userId);

  const ranked = rankActions({
    actions: candidates,
    bottleneck,
    opportunities,
    availableMinutes: minutes,
    preferredSessionMinutes: prefs?.preferred_session_minutes ?? null,
  });

  if (ranked.length === 0) return { mode: "none", items: [], totalMinutes: 0 };

  const sequence = buildSequenceForMinutes(ranked, minutes);
  if (sequence.length > 0) {
    const items = sequence.map((s) => ({
      action: s.ranked.action,
      offsetMin: s.offsetMin,
      sessionMinutes: s.sessionMinutes,
      condensed: false,
      phases: buildPhases(s.ranked.action.actionType, s.sessionMinutes),
    }));
    return {
      mode: "sequence",
      items,
      totalMinutes: items.reduce((sum, i) => sum + i.sessionMinutes, 0),
    };
  }

  const single = bestSingleActionForMinutes(ranked, minutes);
  if (single) {
    const item: TimePlanItem = {
      action: single.ranked.action,
      offsetMin: 0,
      sessionMinutes: single.sessionMinutes,
      condensed: single.condensed,
      phases: buildPhases(single.ranked.action.actionType, single.sessionMinutes),
    };
    return { mode: "condensed", items: [item], totalMinutes: item.sessionMinutes };
  }

  return { mode: "none", items: [], totalMinutes: 0 };
}
