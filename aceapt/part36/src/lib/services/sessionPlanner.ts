import type { ActionType, ExecutionSessionPhase } from "../types";
import type { RankedAction } from "./priorityEngine";

// Phase templates as proportions of the total session length. Each
// action type gets a structure that matches what the activity is
// actually like, rather than forcing everything into one timer
// (spec section 16).
const PHASE_TEMPLATES: Record<ActionType, { title: string; share: number }[]> = {
  SIMULATION: [
    { title: "Preparation", share: 0.15 },
    { title: "Focused practice", share: 0.25 },
    { title: "Simulation", share: 0.45 },
    { title: "Reflection", share: 0.15 },
  ],
  CONCEPT_SESSION: [
    { title: "Introduction", share: 0.2 },
    { title: "Deep dive", share: 0.55 },
    { title: "Self-check", share: 0.25 },
  ],
  PRACTICE: [
    { title: "Warm-up", share: 0.15 },
    { title: "Focused practice", share: 0.7 },
    { title: "Review", share: 0.15 },
  ],
  REVIEW: [
    { title: "Recap", share: 0.2 },
    { title: "Targeted review", share: 0.6 },
    { title: "Summary", share: 0.2 },
  ],
  PROJECT_WORK: [
    { title: "Plan", share: 0.1 },
    { title: "Build", share: 0.75 },
    { title: "Wrap-up", share: 0.15 },
  ],
  REFLECTION: [{ title: "Reflection", share: 1 }],
};

// Minimum sensible minutes for a type before it stops being a
// meaningful version of the activity (used by the 20-minute flow to
// decide whether an action can be condensed or should be swapped).
const MIN_VIABLE_MINUTES: Record<ActionType, number> = {
  SIMULATION: 20,
  CONCEPT_SESSION: 10,
  PRACTICE: 10,
  REVIEW: 10,
  PROJECT_WORK: 15,
  REFLECTION: 5,
};

export function buildPhases(actionType: ActionType, totalMinutes: number): ExecutionSessionPhase[] {
  const template = PHASE_TEMPLATES[actionType];
  const phases: ExecutionSessionPhase[] = [];
  let offset = 0;
  let allocated = 0;
  template.forEach((p, idx) => {
    const isLast = idx === template.length - 1;
    const duration = isLast ? totalMinutes - allocated : Math.max(1, Math.round(totalMinutes * p.share));
    phases.push({ title: p.title, startOffsetMin: offset, durationMin: duration });
    offset += duration;
    allocated += duration;
  });
  return phases;
}

export function canCondenseTo(actionType: ActionType, minutes: number): boolean {
  return minutes >= MIN_VIABLE_MINUTES[actionType];
}

export interface SingleActionPlan {
  ranked: RankedAction;
  sessionMinutes: number;
  condensed: boolean;
}

/** "I only have 20 minutes" (spec section 17): pick the highest
 *  priority action that meaningfully fits, condensing the top pick
 *  when it is flexible rather than always swapping to a lesser one. */
export function bestSingleActionForMinutes(ranked: RankedAction[], minutes: number): SingleActionPlan | null {
  for (const r of ranked) {
    if (r.action.estimatedMinutes <= minutes) {
      return { ranked: r, sessionMinutes: r.action.estimatedMinutes, condensed: false };
    }
    if (canCondenseTo(r.action.actionType, minutes)) {
      return { ranked: r, sessionMinutes: minutes, condensed: true };
    }
  }
  return null;
}

export interface SequenceItem {
  ranked: RankedAction;
  offsetMin: number;
  sessionMinutes: number;
}

/** "I have 2 hours" (spec section 18): a simple, explainable greedy
 *  pack of the ranked candidate list into the available time — not a
 *  full optimizer, deliberately, so the ordering stays traceable to
 *  the same priority reasons shown elsewhere. */
export function buildSequenceForMinutes(ranked: RankedAction[], minutes: number): SequenceItem[] {
  const sequence: SequenceItem[] = [];
  let remaining = minutes;
  let offset = 0;
  const used = new Set<string>();

  for (const r of ranked) {
    if (used.has(r.action.id)) continue;
    if (r.action.estimatedMinutes <= remaining) {
      sequence.push({ ranked: r, offsetMin: offset, sessionMinutes: r.action.estimatedMinutes });
      used.add(r.action.id);
      offset += r.action.estimatedMinutes;
      remaining -= r.action.estimatedMinutes;
    }
    if (remaining < 10) break; // not enough runway left for another meaningful step
  }
  return sequence;
}
