import type { AttemptFinalStatus } from "../domain/types.js";

export interface ScorableAttempt {
  isCorrect: boolean | null;
  finalStatus: AttemptFinalStatus;
  weight: number;
}

export interface ScoringRules {
  correctMarks: number;
  unansweredMarks: number;
}

export interface NegativeMarking {
  enabled: boolean;
  penaltyFraction: number; // fraction of correctMarks deducted per wrong answer
}

export interface ScoringResult {
  totalScore: number;
  maxScore: number;
  accuracy: number; // 0-1, correct / answered (not correct / total — an unanswered question isn't a wrong answer)
  correctCount: number;
  incorrectCount: number;
  answeredCount: number;
}

export function scoreSimulation(
  attempts: ScorableAttempt[],
  scoringRules: ScoringRules,
  negativeMarking: NegativeMarking
): ScoringResult {
  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let answeredCount = 0;

  for (const a of attempts) {
    maxScore += scoringRules.correctMarks * a.weight;

    if (a.finalStatus === "answered") {
      answeredCount += 1;
      if (a.isCorrect) {
        totalScore += scoringRules.correctMarks * a.weight;
        correctCount += 1;
      } else {
        incorrectCount += 1;
        if (negativeMarking.enabled) {
          totalScore -= scoringRules.correctMarks * negativeMarking.penaltyFraction * a.weight;
        }
      }
    } else {
      totalScore += scoringRules.unansweredMarks * a.weight;
    }
  }

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 1000) / 1000 : 0,
    correctCount,
    incorrectCount,
    answeredCount,
  };
}
