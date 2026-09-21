// Sections 12, 23, 24 — observable behavior only. No psychological or
// mental-health inference anywhere in this file: every function reports
// what happened (accuracy dropped, a stall preceded a wrong answer), never
// why it happened.

import type { SessionResponse, TimeSegmentPerformance, RecoveryPattern, QuestionStrategySignals } from './types.js';
import { mean, stddev } from './util.js';

function segment(responses: SessionResponse[], frac: [number, number]): SessionResponse[] {
  const n = responses.length;
  const start = Math.floor(n * frac[0]);
  const end = Math.ceil(n * frac[1]);
  return responses.slice(start, end);
}

function accuracy(responses: SessionResponse[]): number {
  if (!responses.length) return 0;
  return responses.filter((r) => r.isCorrect).length / responses.length;
}

export function analyzeTimeSegments(responses: SessionResponse[]): TimeSegmentPerformance[] {
  const ordered = [...responses].sort((a, b) => a.questionIndex - b.questionIndex);
  const segments: { key: TimeSegmentPerformance['segment']; frac: [number, number] }[] = [
    { key: 'FIRST_QUARTER', frac: [0, 0.25] },
    { key: 'MIDDLE_HALF', frac: [0.25, 0.75] },
    { key: 'FINAL_QUARTER', frac: [0.75, 1] },
  ];
  return segments.map(({ key, frac }) => {
    const chunk = segment(ordered, frac);
    const times = chunk.map((r) => r.timeTakenMs);
    return {
      segment: key,
      accuracy: accuracy(chunk),
      avgResponseTimeMs: mean(times),
      responseTimeVarianceMs: stddev(times),
    };
  });
}

/** Section 12 — flags late-assessment performance degradation without
 *  making any claim about its cause. */
export function detectLateTestDegradation(segments: TimeSegmentPerformance[], thresholdPct: number): boolean {
  const first = segments.find((s) => s.segment === 'FIRST_QUARTER');
  const last = segments.find((s) => s.segment === 'FINAL_QUARTER');
  if (!first || !last) return false;
  return first.accuracy - last.accuracy >= thresholdPct;
}

/** Section 23 — purely behavioral: what happened after a difficult
 *  question, not why. */
export function analyzeRecoveryPattern(responses: SessionResponse[]): RecoveryPattern {
  const ordered = [...responses].sort((a, b) => a.questionIndex - b.questionIndex);
  const baselineAccuracy = accuracy(ordered);

  const afterDifficult: SessionResponse[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];
    if (cur && next && (cur.difficulty === 'HARD' || cur.difficulty === 'TARGET') && (cur.stalled || !cur.isCorrect)) {
      afterDifficult.push(next);
    }
  }
  const afterDifficultQuestionAccuracy = afterDifficult.length ? accuracy(afterDifficult) : baselineAccuracy;
  const longStallFollowedByInaccuracy = afterDifficult.length > 0
    && afterDifficultQuestionAccuracy < baselineAccuracy - 0.15;

  return {
    afterDifficultQuestionAccuracy,
    baselineAccuracy,
    longStallFollowedByInaccuracy,
    maintainsPerformanceAfterDifficulty: afterDifficult.length > 0 && !longStallFollowedByInaccuracy,
  };
}

/** Section 24 — observed behavior only; the verification engine (not this
 *  function) decides what these signals mean relative to a target profile. */
export function analyzeQuestionStrategy(responses: SessionResponse[]): QuestionStrategySignals {
  const times = responses.map((r) => r.timeTakenMs);
  const plausibleGuessFloorMs = 3000;
  return {
    avgTimePerQuestionMs: mean(times),
    skipRate: responses.length ? responses.filter((r) => r.skipped).length / responses.length : 0,
    // Return-to-question behavior requires navigation-event data not
    // captured by this simplified response log — see TRUTH_TABLE.md.
    returnRate: 0,
    answerChangeRate: responses.length ? responses.filter((r) => r.changedAnswer).length / responses.length : 0,
    longStallCount: responses.filter((r) => r.stalled).length,
    rapidResponseCount: responses.filter((r) => r.timeTakenMs < plausibleGuessFloorMs && !r.skipped).length,
  };
}
