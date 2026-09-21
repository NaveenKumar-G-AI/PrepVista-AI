import type {
  ActionType,
  CapabilityCategory,
  CapabilityGap,
  Recommendation,
  RecommendationActionEvent,
  ReadinessEvent,
} from "../types/domain.js";
import type { ExplanationProvider } from "./explanation.service.js";

// Named, explained constants — not magic numbers.
const MAX_DO_FIRST = 2; // top N gaps shown as the immediate focus
const MAX_DO_NEXT = 2; // next tier, queued but not urgent

const ACTION_BY_CATEGORY: Record<CapabilityCategory, { actionType: ActionType; label: string }> = {
  technical: { actionType: "TARGETED_PRACTICE", label: "Targeted Practice Set" },
  aptitude: { actionType: "TIMED_DRILL", label: "Timed Practice Drill" },
  soft_skill: { actionType: "MOCK_SIMULATION", label: "Mock Interview Simulation" },
};

export function recommendationId(capabilityId: string, actionType: ActionType): string {
  return `${capabilityId}__${actionType}`;
}

export function parseRecommendationId(id: string): { capabilityId: string; actionType: string } | null {
  const idx = id.indexOf("__");
  if (idx === -1) return null;
  return { capabilityId: id.slice(0, idx), actionType: id.slice(idx + 2) };
}

/** Looks up the most recent complete/skip event per recommendation id. */
function buildLastActionMap(events: ReadinessEvent[]): Map<string, RecommendationActionEvent> {
  const map = new Map<string, RecommendationActionEvent>();
  // events are newest-first from the repository; keep only the first (latest) per id
  for (const event of events) {
    if (event.type !== "ACTION_COMPLETED" && event.type !== "ACTION_SKIPPED") continue;
    const id = event.payload.recommendationId as string | undefined;
    if (!id || map.has(id)) continue;
    map.set(id, { type: event.type, at: event.createdAt });
  }
  return map;
}

export async function buildRecommendations(
  gaps: (CapabilityGap & { priorityScore: number })[],
  explanationProvider: ExplanationProvider,
  recentEvents: ReadinessEvent[],
): Promise<{ doFirst: Recommendation[]; doNext: Recommendation[]; optional: Recommendation[] }> {
  const lastActionByRecId = buildLastActionMap(recentEvents);

  const candidates = gaps.filter((g) => g.evidenceCount === 0 || (g.gap ?? 0) > 0);
  const ranked = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore);

  const recommendations: Recommendation[] = await Promise.all(
    ranked.map(async (gap) => {
      const { actionType, label } =
        gap.evidenceCount === 0
          ? { actionType: "TAKE_ASSESSMENT" as ActionType, label: "Take Assessment" }
          : ACTION_BY_CATEGORY[gap.category];
      const id = recommendationId(gap.capabilityId, actionType);
      const explanation = await explanationProvider.explain(gap);
      return {
        id,
        capabilityId: gap.capabilityId,
        capabilityName: gap.capabilityName,
        actionType,
        actionLabel: label,
        priority: "OPTIONAL", // assigned below, by rank
        confidence: gap.confidence,
        explanation,
        evidence: gap.evidence,
        lastActionEvent: lastActionByRecId.get(id) ?? null,
      } satisfies Recommendation;
    }),
  );

  const doFirst = recommendations.slice(0, MAX_DO_FIRST).map((r) => ({ ...r, priority: "DO_FIRST" as const }));
  const doNext = recommendations
    .slice(MAX_DO_FIRST, MAX_DO_FIRST + MAX_DO_NEXT)
    .map((r) => ({ ...r, priority: "DO_NEXT" as const }));
  const optional = recommendations
    .slice(MAX_DO_FIRST + MAX_DO_NEXT)
    .map((r) => ({ ...r, priority: "OPTIONAL" as const }));

  return { doFirst, doNext, optional };
}
