import { AnswerRecord, DecisionOutcome, Question } from '../domain/types';
import { mean, round1 } from '../util/math';

// ============================================================
// DECISION TRACKING SERVICE  (spec sections 18, 19, 20)
// ============================================================
// Classifies every question into exactly one of the six outcomes the
// spec defines. Thresholds are named constants below (not magic
// numbers) so they can be tuned or replaced with a validated model
// without touching the classification logic itself. This is a
// heuristic composite, not a psychometric instrument - see README
// "Known simplifications".

const EFFICIENT_TIME_RATIO = 1.3; // correct + at/under 1.3x expected time -> efficient
const QUICK_WRONG_RATIO = 0.5; // wrong + under half the expected time -> looks like a guess

const OUTCOME_WEIGHT: Record<DecisionOutcome, number> = {
  CORRECT_EFFICIENT: 100,
  CORRECT_INEFFICIENT: 70,
  SKIPPED_GOOD_DECISION: 65,
  WRONG_QUICK: 30,
  WRONG_EXCESSIVE_TIME: 20,
  SKIPPED_MISSED_OPPORTUNITY: 15,
};

export class DecisionTrackingService {
  classify(record: AnswerRecord, question: Question): DecisionOutcome {
    const ratio = question.expectedSolveTimeSeconds > 0
      ? record.timeSpentSeconds / question.expectedSolveTimeSeconds
      : 1;

    if (record.skipped) {
      if (record.returned) {
        // Returned to it: did the second pass pay off?
        return record.isCorrect ? 'SKIPPED_GOOD_DECISION' : 'SKIPPED_MISSED_OPPORTUNITY';
      }
      // Never returned: skipping an easy question and never coming back
      // is the pattern most likely to be a missed opportunity; skipping
      // a harder one under time pressure is a reasonable call.
      return question.difficulty === 'easy' ? 'SKIPPED_MISSED_OPPORTUNITY' : 'SKIPPED_GOOD_DECISION';
    }

    if (record.isCorrect) {
      return ratio <= EFFICIENT_TIME_RATIO ? 'CORRECT_EFFICIENT' : 'CORRECT_INEFFICIENT';
    }

    return ratio < QUICK_WRONG_RATIO ? 'WRONG_QUICK' : 'WRONG_EXCESSIVE_TIME';
  }

  classifyAll(answers: AnswerRecord[], questions: Map<string, Question>): DecisionOutcome[] {
    return answers
      .filter((a) => a.selectedOptionId !== null || a.skipped)
      .map((a) => this.classify(a, questions.get(a.questionId)!));
  }

  score(outcomes: DecisionOutcome[]): number {
    if (outcomes.length === 0) return 0;
    return round1(mean(outcomes.map((o) => OUTCOME_WEIGHT[o])));
  }
}
