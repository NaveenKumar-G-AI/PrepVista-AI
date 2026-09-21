import type { ActionItem, CapabilityArea, Opportunity } from "../types";

export type ReasonKey =
  | "BOTTLENECK_ALIGNED"
  | "GOAL_ALIGNED"
  | "OPPORTUNITY_SOON"
  | "FITS_AVAILABLE_TIME"
  | "MATCHES_YOUR_PACE"
  | "RESURFACED_AFTER_DEFER"
  | "HIGHER_IMPACT_THAN_ALTERNATIVES";

export interface RankedAction {
  action: ActionItem;
  score: number;
  reasons: ReasonKey[];
}

export interface PriorityEngineInput {
  actions: ActionItem[];
  bottleneck: CapabilityArea | undefined;
  opportunities: Opportunity[];
  availableMinutes: number | null;
  preferredSessionMinutes: number | null;
}

function daysUntil(dateIso: string): number {
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Only actions whose prerequisites are satisfied are ever eligible —
 *  dependency intelligence (spec section 31) is enforced by exclusion,
 *  not just a scoring penalty. */
export function eligibleActions(actions: ActionItem[]): ActionItem[] {
  return actions.filter((a) => a.prerequisiteSatisfied);
}

export function rankActions(input: PriorityEngineInput): RankedAction[] {
  const { actions, bottleneck, opportunities, availableMinutes, preferredSessionMinutes } = input;
  const opportunityById = new Map(opportunities.map((o) => [o.id, o]));

  const ranked = eligibleActions(actions).map((action) => {
    let score = 0;
    const reasons: ReasonKey[] = [];

    if (bottleneck && action.capabilityAreaId === bottleneck.id) {
      score += 40;
      reasons.push("BOTTLENECK_ALIGNED");
    } else if (action.capabilityAreaId) {
      score += 8;
      reasons.push("GOAL_ALIGNED");
    }

    if (action.opportunityId) {
      const opp = opportunityById.get(action.opportunityId);
      if (opp?.eventDate) {
        const days = daysUntil(opp.eventDate);
        if (days >= 0 && days <= 14) {
          score += Math.max(0, 25 - days * 1.6);
          reasons.push("OPPORTUNITY_SOON");
        }
      }
    }

    if (availableMinutes != null) {
      if (action.estimatedMinutes <= availableMinutes) {
        score += 10;
        reasons.push("FITS_AVAILABLE_TIME");
      } else {
        score -= Math.min(15, (action.estimatedMinutes - availableMinutes) / 4);
      }
    }

    if (preferredSessionMinutes != null) {
      const delta = Math.abs(action.estimatedMinutes - preferredSessionMinutes);
      if (delta <= 10) {
        score += 6;
        reasons.push("MATCHES_YOUR_PACE");
      }
    }

    if (action.deferCount > 0) {
      const resurface = Math.min(6, action.deferCount * 2);
      score += resurface;
      reasons.push("RESURFACED_AFTER_DEFER");
    }

    // Small effort tie-break: prefer the lighter-lift action when
    // everything else is close, never as a dominant factor (spec
    // section 79 — quality of action over quantity/ease).
    score += Math.max(0, 6 - action.estimatedMinutes / 15);

    return { action, score, reasons };
  });

  ranked.sort((a, b) => b.score - a.score);

  // Mark the runner-up comparison reason on the winner only, once we
  // know there was real competition to beat.
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 12) {
    ranked[0].reasons.push("HIGHER_IMPACT_THAN_ALTERNATIVES");
  }

  return ranked;
}

const REASON_PHRASES: Record<ReasonKey, string> = {
  BOTTLENECK_ALIGNED: "Addresses your current bottleneck",
  GOAL_ALIGNED: "Connected to your target role",
  OPPORTUNITY_SOON: "Relevant to an opportunity coming up soon",
  FITS_AVAILABLE_TIME: "Fits the time you have",
  MATCHES_YOUR_PACE: "Matches the session length that has worked for you",
  RESURFACED_AFTER_DEFER: "Was deferred before — bringing it back",
  HIGHER_IMPACT_THAN_ALTERNATIVES: "Higher priority than the alternatives right now",
};

/** Deterministic fallback bullets, used when the AI layer is
 *  unavailable (spec sections 8, 66, 82) — every candidate reason
 *  the engine actually found, in a human-readable sentence. */
export function deterministicRationale(reasons: ReasonKey[]): { summary: string; bullets: string[] } {
  const bullets = reasons.slice(0, 4).map((r) => REASON_PHRASES[r]);
  if (bullets.length === 0) bullets.push("The next concrete step toward your goal");
  const summary =
    reasons.includes("BOTTLENECK_ALIGNED") && reasons.includes("OPPORTUNITY_SOON")
      ? "This directly targets your current bottleneck ahead of an upcoming opportunity."
      : reasons.includes("BOTTLENECK_ALIGNED")
        ? "This directly targets your current bottleneck."
        : "This is the highest-impact step available right now.";
  return { summary, bullets };
}
