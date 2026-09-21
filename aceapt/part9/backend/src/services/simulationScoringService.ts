import { AnswerRecord, DimensionScores, NegativeMarkingRule, Question } from '../domain/types';
import { clamp, mean, round1, round2 } from '../util/math';

// ============================================================
// SIMULATION SCORING SERVICE  (spec sections 18, 19, 29, 34, 48)
// ============================================================
// Deterministic scoring core, per spec section 46 ("Use deterministic
// code for ... scoring"). No AI call anywhere in this file.

export interface RawScoreBreakdown {
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  rawScore: number;
  maxScore: number;
  accuracyPercent: number;
}

const DIMENSION_WEIGHTS: DimensionScores = {
  accuracy: 0.3,
  decisionQuality: 0.2,
  timeManagement: 0.15,
  speed: 0.1,
  consistency: 0.1,
  recovery: 0.075,
  endurance: 0.075,
};

export class SimulationScoringService {
  computeRawScore(
    answers: AnswerRecord[],
    questionCount: number,
    negativeMarking: NegativeMarkingRule,
  ): RawScoreBreakdown {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let raw = 0;

    for (const a of answers) {
      if (a.selectedOptionId === null || a.skipped) {
        skipped++;
        raw += negativeMarking.skipped;
      } else if (a.isCorrect) {
        correct++;
        raw += negativeMarking.correct;
      } else {
        wrong++;
        raw += negativeMarking.wrong;
      }
    }

    return {
      correctCount: correct,
      wrongCount: wrong,
      skippedCount: skipped,
      rawScore: round2(raw),
      maxScore: round2(questionCount * negativeMarking.correct),
      accuracyPercent: questionCount > 0 ? round1((correct / questionCount) * 100) : 0,
    };
  }

  speedScore(answers: AnswerRecord[], questions: Map<string, Question>): number {
    const attempted = answers.filter((a) => a.selectedOptionId !== null && !a.skipped && a.timeSpentSeconds > 0);
    if (attempted.length === 0) return 0;

    const ratios = attempted.map((a) => {
      const q = questions.get(a.questionId);
      return q && q.expectedSolveTimeSeconds > 0 ? a.timeSpentSeconds / q.expectedSolveTimeSeconds : 1;
    });
    const avgRatio = mean(ratios);
    // avgRatio 1.0 (on pace) -> 100, avgRatio 2.0 (2x expected time) -> 0.
    return round1(clamp(100 - (avgRatio - 1) * 100, 0, 100));
  }

  /**
   * Transparent, tunable composite - explicitly NOT a validated
   * psychometric instrument. Weights are named constants above so a
   * real assessment-science review can adjust them without touching
   * call sites. See README "Known simplifications".
   */
  overallScore(dimensions: DimensionScores): number {
    const weighted =
      dimensions.accuracy * DIMENSION_WEIGHTS.accuracy +
      dimensions.decisionQuality * DIMENSION_WEIGHTS.decisionQuality +
      dimensions.timeManagement * DIMENSION_WEIGHTS.timeManagement +
      dimensions.speed * DIMENSION_WEIGHTS.speed +
      dimensions.consistency * DIMENSION_WEIGHTS.consistency +
      dimensions.recovery * DIMENSION_WEIGHTS.recovery +
      dimensions.endurance * DIMENSION_WEIGHTS.endurance;
    return round1(clamp(weighted, 0, 100));
  }
}
