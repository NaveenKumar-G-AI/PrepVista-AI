import { config } from '../config/index.js';
import type { Evidence } from '../types.js';

/**
 * Detects "same misconception, attempt after attempt" (Phase 23): the same
 * mistakeCategory recurring across the most recent evidence for a skill. When
 * true, the caller should deliberately re-serve a challenge targeting that
 * exact pattern (not avoid it via the normal repetition penalty).
 */
export function shouldTargetRepetition(evidence: Evidence[]): { target: boolean; mistakeCategory: string | null; lastChallengeId: string | null } {
  const recent = evidence.slice(-config.mastery.repeatedMistakeWindow);
  if (recent.length < 2) return { target: false, mistakeCategory: null, lastChallengeId: null };
  const failing = recent.filter((e) => e.mistakeCategory && e.mistakeCategory !== 'NONE' && !e.languageIssue);
  if (failing.length < 2) return { target: false, mistakeCategory: null, lastChallengeId: null };
  const counts = new Map<string, number>();
  for (const e of failing) counts.set(e.mistakeCategory as string, (counts.get(e.mistakeCategory as string) ?? 0) + 1);
  const [cat, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (count / recent.length >= config.mastery.repeatedMistakeThresholdFraction) {
    const lastMatching = [...recent].reverse().find((e) => e.mistakeCategory === cat);
    return { target: true, mistakeCategory: cat, lastChallengeId: lastMatching?.challengeId ?? null };
  }
  return { target: false, mistakeCategory: null, lastChallengeId: null };
}
