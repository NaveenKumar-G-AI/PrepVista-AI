import { ContentItem } from "../types";

export type Difficulty = ContentItem["difficulty"];

const LADDER: Difficulty[] = ["EASY", "MEDIUM", "MEDIUM_HARD", "HARD"];

/**
 * Section 23: don't jump straight from "doing fine at medium" to "only hard
 * questions" - bridge through the step in between. This is a deliberately
 * small heuristic (a fixed ladder + two-in-a-row-correct rule), not a full
 * item-response-theory model; a real implementation should reuse whatever
 * PrepVista's question engine already does for difficulty selection.
 */
export function nextDifficulty(history: { difficulty: Difficulty; correct: boolean }[]): Difficulty {
  if (history.length === 0) return "MEDIUM";

  const last = history[history.length - 1];
  const currentIndex = LADDER.indexOf(last.difficulty);

  if (!last.correct) {
    // A miss: hold or step back one rung, never straight to the bottom.
    return LADDER[Math.max(0, currentIndex - 1)];
  }

  const lastTwoCorrect = history.length >= 2 && history[history.length - 2].correct;
  if (lastTwoCorrect && currentIndex < LADDER.length - 1) {
    return LADDER[currentIndex + 1];
  }
  return last.difficulty;
}
