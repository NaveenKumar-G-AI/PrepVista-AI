import { Hint, Question } from "../domain/types";

export interface HintResult {
  hint: Hint | null;
  isFinal: boolean;
  nextLevelAvailable: number | null;
}

/**
 * §21 — hints are strictly progressive: level N can't be skipped to, and the
 * complete solution (level 5 / FINAL) is never the first thing shown.
 * `currentLevel` is how many hints have already been used for this attempt
 * (0 = none yet).
 */
export function getNextHint(question: Question, currentLevel: number): HintResult {
  const sorted = [...question.hints].sort((a, b) => a.level - b.level);
  const next = sorted.find((h) => h.level === currentLevel + 1);
  if (!next) {
    return { hint: null, isFinal: false, nextLevelAvailable: null };
  }
  const isFinal = next.level === 5;
  const nextLevelAvailable = sorted.some((h) => h.level === next.level + 1) ? next.level + 1 : null;
  return { hint: next, isFinal, nextLevelAvailable };
}

export function hasMoreHints(question: Question, currentLevel: number): boolean {
  return question.hints.some((h) => h.level === currentLevel + 1);
}
