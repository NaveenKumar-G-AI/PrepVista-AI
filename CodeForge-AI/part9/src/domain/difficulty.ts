import type { Difficulty } from './types.js';

/**
 * PHASE 22 / 23: adapt difficulty from a short recent run of independent
 * outcomes, not from a single result, and never jump more than one step.
 * If independent attempts are repeatedly failing, the caller should prefer
 * REVIEW_PREREQUISITE / GUIDED_PRACTICE over calling this at all — this
 * function only handles the "stay / step up / step down" decision once
 * we've already decided practice continues independently on this skill.
 */
export function suggestNextDifficulty(recentIndependentResults: { difficulty: Difficulty; passed: boolean }[]): Difficulty {
  const last3 = recentIndependentResults.slice(-3);
  if (last3.length < 2) return 'easy';

  const allPassed = last3.every((r) => r.passed);
  const allFailed = last3.every((r) => !r.passed);
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  const lastEntry = last3[last3.length - 1];
  const lastDifficulty: Difficulty = lastEntry ? lastEntry.difficulty : 'easy';
  const idx = order.indexOf(lastDifficulty);

  if (allPassed) return order[Math.min(idx + 1, order.length - 1)] ?? 'hard';
  if (allFailed) return order[Math.max(idx - 1, 0)] ?? 'easy';
  return lastDifficulty;
}
