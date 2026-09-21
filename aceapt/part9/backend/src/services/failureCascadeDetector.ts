import { AnswerRecord, Question } from '../domain/types';
import { clamp, mean, round1, round2 } from '../util/math';

// ============================================================
// FAILURE CASCADE DETECTOR  (spec section 25)
// ============================================================
// Looks for: a question that ate far more time than expected, then a
// window of subsequent questions answered faster than the student's
// own recent baseline AND with an elevated error rate. Never claims
// causation outright - every finding ships with confidence + the raw
// evidence numbers, matching the spec's worked example fields.

const TRIGGER_TIME_RATIO = 2; // question took >= 2x its expected time
const RUSH_THRESHOLD = 0.7; // subsequent avg time < 70% of recent baseline
const ELEVATED_ERROR_RATE = 0.5; // >= half of the following questions wrong
const LOOKBACK = 3;
const LOOKAHEAD = 3;

export interface CascadeFinding {
  type: 'TIME_LOSS_CASCADE';
  confidence: number;
  evidence: {
    triggerQuestionId: string;
    triggerQuestionSequence: number;
    timeExpenditureRatio: number;
    avgResponseTimeBefore: number;
    avgResponseTimeAfter: number;
    errorRateAfter: number;
  };
}

export class FailureCascadeDetector {
  detect(orderedAnswers: AnswerRecord[], questions: Map<string, Question>): CascadeFinding[] {
    const attempted = orderedAnswers.filter((a) => a.selectedOptionId !== null);
    const findings: CascadeFinding[] = [];

    for (let i = 0; i < attempted.length; i++) {
      const question = questions.get(attempted[i].questionId);
      if (!question || question.expectedSolveTimeSeconds <= 0) continue;

      const ratio = attempted[i].timeSpentSeconds / question.expectedSolveTimeSeconds;
      if (ratio < TRIGGER_TIME_RATIO) continue;

      const before = attempted.slice(Math.max(0, i - LOOKBACK), i);
      const after = attempted.slice(i + 1, i + 1 + LOOKAHEAD);
      if (after.length === 0) continue;

      const avgBefore = before.length ? mean(before.map((a) => a.timeSpentSeconds)) : question.expectedSolveTimeSeconds;
      const avgAfter = mean(after.map((a) => a.timeSpentSeconds));
      const errorRateAfter = after.filter((a) => !a.isCorrect).length / after.length;

      const rushed = avgBefore > 0 && avgAfter < avgBefore * RUSH_THRESHOLD;
      const elevatedErrors = errorRateAfter >= ELEVATED_ERROR_RATE;

      if (rushed && elevatedErrors) {
        const timeDropFraction = avgBefore > 0 ? (avgBefore - avgAfter) / avgBefore : 0;
        const confidence = round2(clamp(0.5 + timeDropFraction * 0.3 + errorRateAfter * 0.2, 0, 0.95));
        findings.push({
          type: 'TIME_LOSS_CASCADE',
          confidence,
          evidence: {
            triggerQuestionId: attempted[i].questionId,
            triggerQuestionSequence: i,
            timeExpenditureRatio: round2(ratio),
            avgResponseTimeBefore: round1(avgBefore),
            avgResponseTimeAfter: round1(avgAfter),
            errorRateAfter: round2(errorRateAfter),
          },
        });
      }
    }

    return findings;
  }
}
