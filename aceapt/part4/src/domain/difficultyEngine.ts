import type { DifficultyLevel } from "./types.js";
import { DIFFICULTY_LADDER, EASY_TRAP_ACCURACY_THRESHOLD, EASY_TRAP_MIN_ATTEMPTS, HARD_PUNISHMENT_ACCURACY_THRESHOLD } from "./types.js";

export interface RecentAttempt {
  correct: boolean;
  difficulty: DifficultyLevel;
}

export interface DifficultyRecommendation {
  nextDifficulty: DifficultyLevel;
  changed: "INCREASED" | "DECREASED" | "UNCHANGED";
  message: string | null;
  /**
   * True when a failure was observed at a HARDER tier than the student's
   * foundation tier — the caller must not use this to downgrade foundation-
   * level evidence classification (Phase 14). This engine only ever
   * recommends a difficulty *tier* for the next question; it never returns
   * a skill-wide verdict.
   */
  isHardTierFailureOnly: boolean;
}

function ladderIndex(level: DifficultyLevel): number {
  return DIFFICULTY_LADDER.indexOf(level);
}

function step(level: DifficultyLevel, delta: number): DifficultyLevel {
  const idx = Math.min(DIFFICULTY_LADDER.length - 1, Math.max(0, ladderIndex(level) + delta));
  return DIFFICULTY_LADDER[idx];
}

/**
 * Looks only at attempts made AT the current difficulty tier — mixing tiers
 * into one accuracy number is exactly what causes both failure modes this
 * function exists to avoid.
 */
export function recommendNextDifficulty(current: DifficultyLevel, recentAttempts: RecentAttempt[]): DifficultyRecommendation {
  const atCurrent = recentAttempts.filter((a) => a.difficulty === current).slice(-5);
  const correctCount = atCurrent.filter((a) => a.correct).length;
  const accuracyAtCurrent = atCurrent.length ? correctCount / atCurrent.length : null;

  // Phase 13 — easy-question trap: don't keep serving easy questions once mastered.
  if (accuracyAtCurrent !== null && atCurrent.length >= EASY_TRAP_MIN_ATTEMPTS && accuracyAtCurrent >= EASY_TRAP_ACCURACY_THRESHOLD) {
    const next = step(current, 1);
    if (next !== current) {
      return {
        nextDifficulty: next,
        changed: "INCREASED",
        message: "Your foundation appears stable. Let's test the skill at the next level.",
        isHardTierFailureOnly: false,
      };
    }
  }

  // Phase 14 — hard-question punishment: a rough patch at this tier doesn't
  // get treated as "the skill is broken"; we step back one tier rather than
  // flagging the whole skill, and we flag that this was tier-local so the
  // caller (diagnoseSkill) keeps foundation evidence untouched.
  if (accuracyAtCurrent !== null && atCurrent.length >= EASY_TRAP_MIN_ATTEMPTS && accuracyAtCurrent <= HARD_PUNISHMENT_ACCURACY_THRESHOLD) {
    const next = step(current, -1);
    return {
      nextDifficulty: next,
      changed: next === current ? "UNCHANGED" : "DECREASED",
      message: next === current ? null : "Let's rebuild from a slightly earlier point before pushing forward again.",
      isHardTierFailureOnly: ladderIndex(current) > 0,
    };
  }

  return { nextDifficulty: current, changed: "UNCHANGED", message: null, isHardTierFailureOnly: false };
}
