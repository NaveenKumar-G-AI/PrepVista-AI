import type { LearningEventRecord, StuckSignal } from "./types.js";

export interface AttemptSignal {
  correct: boolean;
  hintUsed: boolean;
  errorSignature: string | null;
  timeMs: number;
  expectedTimeMs: number;
  createdAt: string;
}

const WINDOW = 5;
const REPEATED_FAILURE_THRESHOLD = 3;
const REPEATED_SAME_ERROR_THRESHOLD = 3;
const EXCESSIVE_HINTS_THRESHOLD = 3;
const EXCESSIVE_TIME_MULTIPLIER = 2.5;
const REPEATED_ABANDONMENT_THRESHOLD = 2;

/**
 * Looks at the most recent attempts for one skill+action and returns at most
 * one signal (checked in a fixed priority order) — Feature 4 changes
 * *strategy* on the first true signal rather than stacking interventions.
 */
export function detectStuck(recentAttempts: AttemptSignal[], recentAbandonments: number): StuckSignal {
  const window = recentAttempts.slice(-WINDOW);

  const consecutiveFailures = trailingConsecutive(window, (a) => !a.correct);
  if (consecutiveFailures >= REPEATED_FAILURE_THRESHOLD) {
    return { isStuck: true, signalType: "REPEATED_FAILURE", evidenceRefs: [`${consecutiveFailures} consecutive incorrect attempts`] };
  }

  const errorCounts = new Map<string, number>();
  for (const a of window) {
    if (!a.errorSignature) continue;
    errorCounts.set(a.errorSignature, (errorCounts.get(a.errorSignature) ?? 0) + 1);
  }
  for (const [sig, count] of errorCounts) {
    if (count >= REPEATED_SAME_ERROR_THRESHOLD) {
      return { isStuck: true, signalType: "REPEATED_SAME_ERROR", evidenceRefs: [`error pattern "${sig}" repeated ${count} times`] };
    }
  }

  const hintCount = window.filter((a) => a.hintUsed).length;
  if (hintCount >= EXCESSIVE_HINTS_THRESHOLD) {
    return { isStuck: true, signalType: "EXCESSIVE_HINTS", evidenceRefs: [`hints used on ${hintCount} of the last ${window.length} attempts`] };
  }

  const overTime = window.filter((a) => a.expectedTimeMs > 0 && a.timeMs > a.expectedTimeMs * EXCESSIVE_TIME_MULTIPLIER);
  if (overTime.length >= 2) {
    return { isStuck: true, signalType: "EXCESSIVE_TIME", evidenceRefs: [`${overTime.length} attempts took over ${EXCESSIVE_TIME_MULTIPLIER}x the expected time`] };
  }

  if (window.length >= 4) {
    const firstHalf = window.slice(0, Math.floor(window.length / 2));
    const secondHalf = window.slice(Math.floor(window.length / 2));
    const acc = (xs: AttemptSignal[]) => xs.filter((a) => a.correct).length / xs.length;
    if (acc(secondHalf) <= acc(firstHalf) && acc(secondHalf) < 0.5) {
      return { isStuck: true, signalType: "NO_IMPROVEMENT", evidenceRefs: ["accuracy flat or declining across the recent attempt window"] };
    }
  }

  if (recentAbandonments >= REPEATED_ABANDONMENT_THRESHOLD) {
    return { isStuck: true, signalType: "REPEATED_ABANDONMENT", evidenceRefs: [`action started and abandoned ${recentAbandonments} times without completion`] };
  }

  return { isStuck: false, signalType: "NONE", evidenceRefs: [] };
}

function trailingConsecutive<T>(items: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (!predicate(items[i])) break;
    count++;
  }
  return count;
}

/** Counts ACTION_STARTED events for a skill with no matching ACTION_COMPLETED — a cheap abandonment proxy from the event log. */
export function countAbandonments(events: LearningEventRecord[], skillId: string): number {
  const started = events.filter((e) => e.type === "ACTION_STARTED" && e.skillId === skillId).length;
  const completed = events.filter((e) => e.type === "ACTION_COMPLETED" && e.skillId === skillId).length;
  return Math.max(0, started - completed);
}
