import { AnswerRecord, PerformanceCurvePoint } from '../domain/types';
import { mean, round1, splitIntoSegments } from '../util/math';

// ============================================================
// PERFORMANCE CURVE ANALYZER  (spec section 22)
// ============================================================
// Splits the chronological (question-order) answer sequence into
// three segments and reports accuracy + average response time for
// each - the same underlying split that EnduranceAnalyzer reasons
// about, exposed here as the raw curve for reporting/graphing.

export class PerformanceCurveAnalyzer {
  curve(orderedAnswers: AnswerRecord[]): PerformanceCurvePoint[] {
    const attempted = orderedAnswers.filter((a) => a.selectedOptionId !== null);
    const segments = splitIntoSegments(attempted, 3);
    const labels: PerformanceCurvePoint['segment'][] = ['beginning', 'middle', 'end'];

    return segments.map((seg, idx) => ({
      segment: labels[idx],
      accuracy: seg.length ? round1((seg.filter((a) => a.isCorrect).length / seg.length) * 100) : 0,
      avgTimeSeconds: seg.length ? round1(mean(seg.map((a) => a.timeSpentSeconds))) : 0,
    }));
  }
}
