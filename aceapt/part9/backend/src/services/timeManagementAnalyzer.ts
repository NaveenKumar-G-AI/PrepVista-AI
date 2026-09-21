import { AnswerRecord, Question } from '../domain/types';
import { clamp, round1 } from '../util/math';

// ============================================================
// TIME MANAGEMENT ANALYZER  (spec section 17)
// ============================================================
// Scores whether the student distributed their time budget sensibly:
// rewards staying within a reasonable multiple of a question's
// expected solve time, penalizes leaving questions completely
// untouched (as opposed to a deliberate, tracked skip).

const OVER_INVESTMENT_RATIO = 1.5;

export class TimeManagementAnalyzer {
  score(answers: AnswerRecord[], questions: Map<string, Question>): number {
    const attempted = answers.filter((a) => a.selectedOptionId !== null || a.skipped);
    if (attempted.length === 0) return 0;

    const withinBudget = attempted.filter((a) => {
      const q = questions.get(a.questionId);
      if (!q || q.expectedSolveTimeSeconds <= 0) return true;
      return a.timeSpentSeconds / q.expectedSolveTimeSeconds <= OVER_INVESTMENT_RATIO;
    }).length;

    const budgetAdherence = (withinBudget / attempted.length) * 100;

    const untouched = answers.filter((a) => a.selectedOptionId === null && !a.skipped).length;
    const untouchedPenalty = (untouched / answers.length) * 50;

    return round1(clamp(budgetAdherence - untouchedPenalty, 0, 100));
  }

  averageTimeRatio(answers: AnswerRecord[], questions: Map<string, Question>): number {
    const attempted = answers.filter((a) => a.selectedOptionId !== null && a.timeSpentSeconds > 0);
    if (attempted.length === 0) return 1;
    const ratios = attempted.map((a) => {
      const q = questions.get(a.questionId);
      return q && q.expectedSolveTimeSeconds > 0 ? a.timeSpentSeconds / q.expectedSolveTimeSeconds : 1;
    });
    return round1(ratios.reduce((s, r) => s + r, 0) / ratios.length);
  }
}
