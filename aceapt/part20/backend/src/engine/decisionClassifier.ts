export type DecisionLabel =
  | "Not Reached"
  | "Bad Skip"
  | "Good Skip"
  | "Late Skip"
  | "Overinvestment"
  | "Efficient Solve"
  | "Good Attempt"
  | "Premature Guess";

export interface Classifiable {
  attempted: boolean;
  correct: boolean;
  timeSec: number;
  difficulty: string;
}

/**
 * Labels a single question's outcome as a behavioral decision, not a
 * personality judgment (spec §17). Thresholds are relative to this
 * session's own average time/question so the same absolute time reads
 * differently on a fast test vs a slow one.
 */
export function classifyDecision(p: Classifiable, avgTimePerQuestionSec: number): DecisionLabel {
  if (!p.attempted) {
    if (p.timeSec === 0) return "Not Reached";
    if (p.timeSec > avgTimePerQuestionSec * 1.3) return "Late Skip";
    const lowerDifficulty = p.difficulty === "Easy" || p.difficulty === "Medium";
    return lowerDifficulty ? "Bad Skip" : "Good Skip";
  }
  if (p.correct) {
    if (p.timeSec > avgTimePerQuestionSec * 2) return "Overinvestment";
    if (p.timeSec < avgTimePerQuestionSec * 0.6) return "Efficient Solve";
    return "Good Attempt";
  }
  if (p.timeSec > avgTimePerQuestionSec * 1.8) return "Overinvestment";
  if (p.timeSec < avgTimePerQuestionSec * 0.4) return "Premature Guess";
  return "Good Attempt";
}
