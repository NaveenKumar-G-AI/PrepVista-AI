/**
 * CodeForge — Progressive Hints (§29)
 *
 * Hints are authored content on the Challenge itself (index 0 = level 1),
 * ordered least-to-most specific. This module only enforces the progression
 * rule — never skip ahead — and hands back exactly one level at a time; the
 * caller (service/codeforgeService.ts) is responsible for recording the
 * request as attempt evidence.
 */

import type { Challenge } from "../domain/types";

export interface HintResult {
  level: number;
  text: string;
  isFinalHint: boolean;
}

export function getHint(challenge: Challenge, level: number): HintResult {
  if (challenge.hints.length === 0) {
    throw new Error(`challenge ${challenge.challengeId} has no hints configured`);
  }
  const clampedLevel = Math.min(Math.max(1, Math.floor(level)), challenge.hints.length);
  const text = challenge.hints[clampedLevel - 1]!;
  return { level: clampedLevel, text, isFinalHint: clampedLevel === challenge.hints.length };
}

/** Given the levels already requested for the current submission, what's the next one to hand out. */
export function nextHintLevel(previousLevelsRequested: number[]): number {
  return previousLevelsRequested.length === 0 ? 1 : Math.max(...previousLevelsRequested) + 1;
}
