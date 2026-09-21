import { getCurrentBottleneck } from "../db/repoGoals";
import { listCandidateActions, clearPrimary, setRecommendation, setPriorityRankOnly } from "../db/repoActions";
import { listUpcomingOpportunities, getTimeAvailability, getPreferences, logEvent } from "../db/repoPlanning";
import { rankActions, deterministicRationale, type RankedAction } from "./priorityEngine";
import { callClaudeJson } from "../ai/client";
import { rationaleSystemPrompt, rationaleUserPrompt, type RationaleContext } from "../ai/prompts";
import { ensureActionSupply } from "./actionCompiler";
import { currentWeekStart } from "./dates";
import type { CareerGoal } from "../types";

const MAX_RECOMMENDED = 3; // 1 primary + up to 2 supporting (spec section 7)

export interface RecommendationResult {
  primary: RankedAction | null;
  supporting: RankedAction[];
}

/** Recomputes and persists the current recommendation set for a goal.
 *  Safe to call often — it is cheap (in-process ranking over a small
 *  candidate set) and only calls the AI for the primary action's
 *  rationale, and only once per refresh. */
export async function refreshRecommendations(userId: string, goal: CareerGoal): Promise<RecommendationResult> {
  await ensureActionSupply(userId, goal);

  const candidates = listCandidateActions(userId, goal.id);
  if (candidates.length === 0) {
    return { primary: null, supporting: [] };
  }

  const bottleneck = getCurrentBottleneck(userId, goal.id);
  const opportunities = listUpcomingOpportunities(userId);
  const weekStart = currentWeekStart();
  const availableMinutes = getTimeAvailability(userId, weekStart) ?? null;
  const prefs = getPreferences(userId);

  const ranked = rankActions({
    actions: candidates,
    bottleneck,
    opportunities,
    availableMinutes,
    preferredSessionMinutes: prefs?.preferred_session_minutes ?? null,
  });

  if (ranked.length === 0) {
    return { primary: null, supporting: [] };
  }

  clearPrimary(userId, goal.id);

  const top = ranked.slice(0, MAX_RECOMMENDED);
  const [primary, ...supporting] = top;

  const opp = primary.action.opportunityId ? opportunities.find((o) => o.id === primary.action.opportunityId) : null;
  const rationaleCtx: RationaleContext = {
    goalTitle: goal.title,
    targetRole: goal.targetRole,
    actionTitle: primary.action.title,
    actionType: primary.action.actionType,
    bottleneckName: bottleneck?.name ?? null,
    opportunityTitle: opp?.title ?? null,
    opportunityDaysAway:
      opp?.eventDate != null ? Math.ceil((new Date(opp.eventDate).getTime() - Date.now()) / 86_400_000) : null,
    isFollowUpToWeakEvidence: primary.reasons.includes("BOTTLENECK_ALIGNED"),
    weakEvidenceSummary: bottleneck ? `${bottleneck.name} is the current focus area` : null,
  };

  const aiResult = await callClaudeJson<{ summary: string; bullets: string[] }>(
    rationaleSystemPrompt(),
    rationaleUserPrompt(rationaleCtx)
  );

  const { summary, bullets } =
    aiResult && aiResult.summary && Array.isArray(aiResult.bullets) && aiResult.bullets.length > 0
      ? aiResult
      : deterministicRationale(primary.reasons);

  setRecommendation(userId, primary.action.id, {
    isPrimary: true,
    priorityRank: 0,
    rationaleText: summary,
    rationaleBullets: bullets,
    rationaleGeneratedBy: aiResult ? "AI" : "DETERMINISTIC",
  });

  supporting.forEach((r, idx) => {
    const det = deterministicRationale(r.reasons);
    setRecommendation(userId, r.action.id, {
      isPrimary: false,
      priorityRank: idx + 1,
      rationaleText: det.summary,
      rationaleBullets: det.bullets,
      rationaleGeneratedBy: "DETERMINISTIC",
    });
  });

  // Any remaining ranked-but-unselected candidates keep a rank so the
  // Live Career Plan can still show a sensible order without a full
  // rationale (avoids an AI call per candidate — spec section 65).
  ranked.slice(MAX_RECOMMENDED).forEach((r, idx) => {
    setPriorityRankOnly(userId, r.action.id, MAX_RECOMMENDED + idx);
  });

  logEvent(userId, "ACTION_RECOMMENDED", { actionId: primary.action.id, title: primary.action.title });

  return { primary, supporting };
}
