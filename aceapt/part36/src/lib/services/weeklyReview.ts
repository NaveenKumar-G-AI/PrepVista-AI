import { countActionsByStatusSince, countActionsRecommendedSince } from "../db/repoActions";
import { listEvidenceSince } from "../db/repoExecution";
import { listRecentAdjustments, getCachedWeeklyReview, setCachedWeeklyReview } from "../db/repoPlanning";
import { listCapabilities, getCurrentBottleneck } from "../db/repoGoals";
import { listUpcomingOpportunities } from "../db/repoPlanning";
import { callClaudeText } from "../ai/client";
import { weeklyNarrativeSystemPrompt, weeklyNarrativeUserPrompt } from "../ai/prompts";
import { computePlanHealth } from "./planHealth";
import { currentWeekStart, daysUntil, weekStartFor } from "./dates";
import type { CareerGoal } from "../types";

export interface WeeklyReviewResult {
  weekStart: string;
  recommended: number;
  completed: number;
  measured: number;
  deferred: number;
  blocked: number;
  capabilityChanges: { name: string; trend: string; isBottleneck: boolean }[];
  currentBottleneck: string | null;
  upcomingDeadlineDays: number | null;
  planHealth: ReturnType<typeof computePlanHealth>;
  adjustments: { reason: string; description: string; createdAt: string }[];
  narrative: string;
  narrativeGeneratedBy: "AI" | "DETERMINISTIC";
}

export async function getWeeklyReview(userId: string, goal: CareerGoal, forWeek?: string): Promise<WeeklyReviewResult> {
  const weekStart = forWeek ?? currentWeekStart();
  const sinceIso = new Date(`${weekStart}T00:00:00.000Z`).toISOString();

  const recommended = countActionsRecommendedSince(userId, sinceIso);
  const completed =
    countActionsByStatusSince(userId, "SELF_REPORTED_COMPLETE", sinceIso) +
    countActionsByStatusSince(userId, "VERIFIED_COMPLETE", sinceIso) +
    countActionsByStatusSince(userId, "MEASURED", sinceIso) +
    countActionsByStatusSince(userId, "IMPROVED", sinceIso);
  const measured = listEvidenceSince(userId, sinceIso).filter(
    (e) => e.evidenceQuality === "MEASURED" || e.evidenceQuality === "VERIFIED"
  ).length;
  const deferred = countActionsByStatusSince(userId, "DEFERRED", sinceIso);
  const blocked = countActionsByStatusSince(userId, "BLOCKED", sinceIso);

  const capabilities = listCapabilities(userId, goal.id);
  const bottleneck = getCurrentBottleneck(userId, goal.id);
  const capabilityChanges = capabilities.map((c) => ({
    name: c.name,
    trend: c.trend,
    isBottleneck: c.isCurrentBottleneck,
  }));

  const opportunities = listUpcomingOpportunities(userId);
  const nextOpportunity = opportunities[0];
  const upcomingDeadlineDays = nextOpportunity?.eventDate ? daysUntil(nextOpportunity.eventDate) : null;

  const planHealth = computePlanHealth(userId, goal);
  const adjustments = listRecentAdjustments(userId, sinceIso).map((a) => ({
    reason: a.reason,
    description: a.description,
    createdAt: a.created_at,
  }));

  const cached = getCachedWeeklyReview(userId, weekStart);
  let narrative: string;
  let narrativeGeneratedBy: "AI" | "DETERMINISTIC";

  if (cached) {
    narrative = cached.narrative_text;
    narrativeGeneratedBy = cached.generated_by as "AI" | "DETERMINISTIC";
  } else {
    const ai = await callClaudeText(
      weeklyNarrativeSystemPrompt(),
      weeklyNarrativeUserPrompt({
        goalTitle: goal.title,
        targetRole: goal.targetRole,
        weekStart,
        recommended,
        completed,
        measured,
        deferred,
        blocked,
        capabilityChanges: capabilityChanges.map((c) => ({ name: c.name, trend: c.trend })),
        currentBottleneck: bottleneck?.name ?? null,
        upcomingDeadlineDays,
      })
    );
    narrative = ai ?? deterministicNarrative({ completed, measured, deferred, blocked, capabilityChanges, bottleneck: bottleneck?.name ?? null });
    narrativeGeneratedBy = ai ? "AI" : "DETERMINISTIC";
    // Only cache once the week is over (or nearly), so an early-week
    // narrative doesn't go stale while the week is still unfolding.
    const isPastWeek = weekStartFor(new Date()) !== weekStart;
    if (isPastWeek) setCachedWeeklyReview(userId, weekStart, narrative, narrativeGeneratedBy);
  }

  return {
    weekStart,
    recommended,
    completed,
    measured,
    deferred,
    blocked,
    capabilityChanges,
    currentBottleneck: bottleneck?.name ?? null,
    upcomingDeadlineDays,
    planHealth,
    adjustments,
    narrative,
    narrativeGeneratedBy,
  };
}

function deterministicNarrative(input: {
  completed: number;
  measured: number;
  deferred: number;
  blocked: number;
  capabilityChanges: { name: string; trend: string }[];
  bottleneck: string | null;
}): string {
  const improving = input.capabilityChanges.filter((c) => c.trend === "IMPROVING").map((c) => c.name);
  const parts: string[] = [];
  parts.push(
    input.completed > 0
      ? `${input.completed} action${input.completed === 1 ? "" : "s"} completed this week, with ${input.measured} producing measured evidence.`
      : `No actions completed yet this week.`
  );
  if (improving.length > 0) {
    parts.push(`${improving.join(" and ")} improved.`);
  } else if (input.bottleneck) {
    parts.push(`${input.bottleneck} is still the focus area with no new measured signal yet.`);
  }
  if (input.deferred > 0 || input.blocked > 0) {
    parts.push(`${input.deferred} action${input.deferred === 1 ? "" : "s"} deferred and ${input.blocked} blocked — the plan has adjusted around these.`);
  }
  return parts.join(" ");
}
