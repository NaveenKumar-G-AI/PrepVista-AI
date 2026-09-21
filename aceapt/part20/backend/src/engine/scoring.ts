import type { EngineQuestion, EngineResponse, Marking } from "./types.js";

export interface ScoreResult {
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  score: number;
  maxScore: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure, deterministic scoring. No AI call, no randomness, no I/O — this is
 * intentional (Feature 20 spec §55: "Do NOT allow an LLM to determine
 * official scores"). Given the same questions/responses/marking it always
 * returns the same result, which is what makes it unit-testable and safe to
 * trust for the official score.
 */
export function scoreSession(
  questions: EngineQuestion[],
  responses: Map<string, EngineResponse>,
  marking: Marking
): ScoreResult {
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  for (const q of questions) {
    const r = responses.get(q.id);
    if (r && r.selectedIndex !== null && r.selectedIndex !== undefined) {
      if (r.selectedIndex === q.correctIndex) correctCount++;
      else wrongCount++;
    } else {
      unattemptedCount++;
    }
  }

  const score = round2(correctCount * marking.correct + wrongCount * marking.wrong + unattemptedCount * marking.skip);
  const maxScore = round2(questions.length * marking.correct);

  return { correctCount, wrongCount, unattemptedCount, score, maxScore };
}
