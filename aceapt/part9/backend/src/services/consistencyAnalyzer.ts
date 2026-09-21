import { AnswerRecord, SimulationQuestionRef } from '../domain/types';
import { clamp, round1, splitIntoSegments, stddev } from '../util/math';

// ============================================================
// CONSISTENCY ANALYZER  (spec section 6.5, "CONSISTENCY")
// ============================================================
// Splits the chronological sequence into quarters and measures the
// spread (standard deviation) of per-quarter accuracy. Low spread =
// steady performer; high spread = accuracy swings wildly across the
// session, independent of whether the overall average is high or low.

export class ConsistencyAnalyzer {
  score(orderedRefs: SimulationQuestionRef[], answers: Record<string, AnswerRecord>): number {
    const ordered = orderedRefs
      .map((ref) => answers[ref.questionId])
      .filter((a): a is AnswerRecord => !!a && a.selectedOptionId !== null);

    if (ordered.length < 4) {
      if (ordered.length === 0) return 0;
      return round1((ordered.filter((a) => a.isCorrect).length / ordered.length) * 100);
    }

    const segments = splitIntoSegments(ordered, 4);
    const segmentAccuracy = segments.map((seg) =>
      seg.length ? (seg.filter((a) => a.isCorrect).length / seg.length) * 100 : 0,
    );
    const spread = stddev(segmentAccuracy);

    return round1(clamp(100 - spread * 2, 0, 100));
  }
}
