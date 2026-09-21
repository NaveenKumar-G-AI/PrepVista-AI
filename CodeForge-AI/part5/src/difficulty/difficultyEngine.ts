import { config } from '../config/index.js';
import type { DifficultyLevel, Evidence } from '../types.js';

export type DifficultyDecision =
  | { mode: 'ADVANCE'; targetLevel: DifficultyLevel; reason: string }
  | { mode: 'HOLD'; targetLevel: DifficultyLevel; reason: string }
  | { mode: 'RECOVER'; targetLevel: DifficultyLevel; reason: string };

const LEVELS = config.difficulty.levels;

function levelIndex(level: DifficultyLevel): number {
  return LEVELS.indexOf(level);
}

/**
 * Decides the next difficulty level for a skill from the student's recent
 * evidence at that skill (Phase 16/17). Repeated independent success ->
 * step up. Repeated failure -> step DOWN into a recovery path rather than
 * continuing to escalate, and only re-advances after a fresh success at the
 * lower level.
 */
export function decideDifficulty(evidence: Evidence[], currentLevel: DifficultyLevel): DifficultyDecision {
  if (evidence.length === 0) {
    return { mode: 'HOLD', targetLevel: 'EASY', reason: 'No evidence yet for this skill — starting at the easiest level.' };
  }

  const recent = [...evidence].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(-4);

  const lastN = (n: number) => recent.slice(-n);

  const consecSuccesses = countConsecutiveFromEnd(recent, (e) => e.rawScore >= 0.999 && e.independent);
  const consecFailures = countConsecutiveFromEnd(recent, (e) => e.rawScore < 0.5);

  if (consecFailures >= config.difficulty.consecutiveFailuresToDecrease) {
    const targetIdx = Math.max(0, levelIndex(currentLevel) - 1);
    // If already at EASY and still failing, the recovery path points at a PREREQUISITE_REVIEW (handled by the caller via gap detection), not a lower coding difficulty that doesn't exist.
    return {
      mode: 'RECOVER',
      targetLevel: LEVELS[targetIdx],
      reason: `${consecFailures} consecutive failures at ${currentLevel} — stepping back to ${LEVELS[targetIdx]} to rebuild a success streak instead of continuing to escalate.`,
    };
  }

  if (consecSuccesses >= config.difficulty.consecutiveSuccessesToIncrease) {
    const targetIdx = Math.min(LEVELS.length - 1, levelIndex(currentLevel) + 1);
    return {
      mode: 'ADVANCE',
      targetLevel: LEVELS[targetIdx],
      reason: `${consecSuccesses} consecutive independent successes at ${currentLevel} — advancing to ${LEVELS[targetIdx]}.`,
    };
  }

  return { mode: 'HOLD', targetLevel: currentLevel, reason: `Performance at ${currentLevel} is mixed — holding steady to gather more evidence before adapting.` };
}

function countConsecutiveFromEnd<T>(arr: T[], predicate: (t: T) => boolean): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) count++;
    else break;
  }
  return count;
}

/** Fatigue signal (Phase 33) - purely from observable product signals, never a medical/psychological claim. */
export function detectFatigueSignal(evidence: Evidence[], attemptDurationsMs: number[]): { signal: boolean; reason: string | null } {
  const recentFailures = evidence.slice(-config.fatigue.recentFailureWindow);
  if (recentFailures.length < config.fatigue.recentFailureWindow) return { signal: false, reason: null };
  const failureRate = recentFailures.filter((e) => e.rawScore < 0.5).length / recentFailures.length;
  const longAttempts = attemptDurationsMs.filter((ms) => ms / 1000 >= config.fatigue.longAttemptSeconds).length;
  if (failureRate >= config.fatigue.recentFailureRateThreshold && longAttempts >= 1) {
    return { signal: true, reason: `${Math.round(failureRate * 100)}% of the last ${recentFailures.length} attempts failed, including at least one unusually long attempt — suggesting a short break or a review challenge instead of harder material.` };
  }
  return { signal: false, reason: null };
}
