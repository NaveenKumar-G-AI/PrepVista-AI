import { AnswerRecord, Question } from '../domain/types';
import { round2 } from '../util/math';

// ============================================================
// ERROR PATTERN ANALYZER  (spec section 26)
// ============================================================
// The spec is explicit: "Do not pretend the system can always
// determine the exact cause." Every classification below carries a
// confidence and falls back to 'insufficient_evidence' rather than
// forcing a guess when the timing signal is ambiguous.

export type ErrorType =
  | 'time_pressure_related'
  | 'careless'
  | 'concept_related'
  | 'strategy_related'
  | 'insufficient_evidence';

export interface ErrorClassification {
  questionId: string;
  type: ErrorType;
  confidence: number;
  evidence: Record<string, unknown>;
}

const VERY_FAST_RATIO = 0.3;
const VERY_SLOW_RATIO = 1.8;
const TIME_PRESSURE_REMAINING_FRACTION = 0.15;

export class ErrorPatternAnalyzer {
  classify(record: AnswerRecord, question: Question): ErrorClassification {
    const ratio = question.expectedSolveTimeSeconds > 0
      ? record.timeSpentSeconds / question.expectedSolveTimeSeconds
      : 1;
    const remainingFraction = record.remainingTimeFractionAtAnswer ?? 1;

    if (ratio < VERY_FAST_RATIO) {
      const underTimePressure = remainingFraction < TIME_PRESSURE_REMAINING_FRACTION;
      return {
        questionId: record.questionId,
        type: underTimePressure ? 'time_pressure_related' : 'careless',
        confidence: 0.6,
        evidence: { timeRatio: round2(ratio), remainingTimeFraction: round2(remainingFraction) },
      };
    }

    if (ratio > VERY_SLOW_RATIO) {
      return {
        questionId: record.questionId,
        type: 'concept_related',
        confidence: 0.55,
        evidence: {
          timeRatio: round2(ratio),
          note: 'Extended time investment without a correct outcome; insufficient evidence to separate concept gap from a calculation error.',
        },
      };
    }

    if (record.previousOptionIds.length > 0) {
      return {
        questionId: record.questionId,
        type: 'strategy_related',
        confidence: 0.5,
        evidence: { answerChanges: record.previousOptionIds.length },
      };
    }

    return {
      questionId: record.questionId,
      type: 'insufficient_evidence',
      confidence: 0.3,
      evidence: { timeRatio: round2(ratio) },
    };
  }

  classifyAll(answers: AnswerRecord[], questions: Map<string, Question>): ErrorClassification[] {
    return answers
      .filter((a) => a.selectedOptionId !== null && a.isCorrect === false)
      .map((a) => this.classify(a, questions.get(a.questionId)!));
  }
}
