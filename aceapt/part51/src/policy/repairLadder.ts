import type { Difficulty } from "../types/training.js";
import type { StabilityResult } from "../domain/stability.js";

/** §44 — ERROR → EXPLAIN → GUIDED_CORRECTION → SIMILAR_PROBLEM → STRUCTURAL_VARIATION → INDEPENDENT_PROBLEM → DELAYED_CHECK. */
export const REPAIR_LADDER_STAGES = [
  "EXPLAIN",
  "GUIDED_CORRECTION",
  "SIMILAR_PROBLEM",
  "STRUCTURAL_VARIATION",
  "INDEPENDENT_PROBLEM",
  "DELAYED_CHECK"
] as const;
export type RepairStage = (typeof REPAIR_LADDER_STAGES)[number];

const CONSECUTIVE_CORRECT_TO_ADVANCE = 2;

/**
 * §44 "Only progress as evidence supports." A single correct answer doesn't
 * advance the ladder; a wrong answer steps back one stage rather than
 * resetting to EXPLAIN, so a student who slips after real progress isn't
 * sent all the way back to square one.
 */
export function nextRepairStage(
  current: RepairStage | null,
  lastAttemptCorrect: boolean,
  consecutiveCorrectAtThisStage: number
): RepairStage {
  if (current === null) return "EXPLAIN";
  const idx = REPAIR_LADDER_STAGES.indexOf(current);

  if (!lastAttemptCorrect) {
    const prevIdx = Math.max(0, idx - 1);
    return REPAIR_LADDER_STAGES[prevIdx]!;
  }
  if (consecutiveCorrectAtThisStage >= CONSECUTIVE_CORRECT_TO_ADVANCE && idx < REPAIR_LADDER_STAGES.length - 1) {
    return REPAIR_LADDER_STAGES[idx + 1]!;
  }
  return current;
}

export type DifficultyAdjustment = "increase" | "decrease" | "hold";

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];
const STREAK_TO_INCREASE = 3;

/** §45 — fail → reduce difficulty; consistent success → increase; never jump abruptly (single steps only). */
export function nextDifficulty(
  current: Difficulty,
  recentCorrectStreak: number,
  justFailed: boolean
): { adjustment: DifficultyAdjustment; next: Difficulty } {
  const idx = DIFFICULTY_ORDER.indexOf(current);

  if (justFailed) {
    const nextIdx = Math.max(0, idx - 1);
    return { adjustment: nextIdx === idx ? "hold" : "decrease", next: DIFFICULTY_ORDER[nextIdx]! };
  }
  if (recentCorrectStreak >= STREAK_TO_INCREASE) {
    const nextIdx = Math.min(DIFFICULTY_ORDER.length - 1, idx + 1);
    return { adjustment: nextIdx === idx ? "hold" : "increase", next: DIFFICULTY_ORDER[nextIdx]! };
  }
  return { adjustment: "hold", next: current };
}

/** §46-47 — once accuracy is stable and at/above target, fade targeted drills toward mixed practice. */
export function shouldFadeToMixedPrecision(stability: StabilityResult, targetAccuracyPct: number): boolean {
  return stability.consistency === "stable" && (stability.mean ?? 0) >= targetAccuracyPct;
}

/**
 * §43 — "Don't immediately give the exact same question again." Prefers any
 * plan candidate not seen in the recent window; only falls back to a repeat
 * if literally nothing else is left in the plan.
 */
export function pickNextQuestionId(planQuestionIds: string[], recentlyUsedIds: string[]): string | null {
  const recentSet = new Set(recentlyUsedIds);
  const fresh = planQuestionIds.find((id) => !recentSet.has(id));
  return fresh ?? planQuestionIds[0] ?? null;
}
