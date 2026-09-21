import type { QuestionAttempt } from "../domain/types.js";

// All functions here are pure and operate on ONE simulation's attempts,
// already ordered by sequencePosition. Nothing here calls the database or an
// LLM — deterministic application logic only (Section 45: "No Magic AI").
// Every function is defensive about small/empty/incomplete data (Section 44,
// 63 edge cases) rather than throwing or returning NaN.

const answered = (attempts: QuestionAttempt[]) =>
  attempts.filter((a) => a.finalStatus === "answered" && a.isCorrect !== null);

const pct = (num: number, den: number): number => (den === 0 ? 0 : (num / den) * 100);

// ---------------------------------------------------------------------------
// Section 9 — accuracy/speed pattern classification
// ---------------------------------------------------------------------------

export type SpeedAccuracyBucket =
  | "HIGH_ACCURACY_HIGH_SPEED"
  | "HIGH_ACCURACY_LOW_SPEED"
  | "LOW_ACCURACY_HIGH_SPEED"
  | "LOW_ACCURACY_LOW_SPEED";

export interface SpeedAccuracyDistribution {
  buckets: Record<SpeedAccuracyBucket, number>; // percentage of answered questions in each bucket
  sampleSize: number;
}

/** "Speed" is relative to the question's own expected time, not a fixed
 * threshold — a fast attempt on a hard question and a fast attempt on an
 * easy one are judged against different baselines. */
export function classifySpeedAccuracy(attempts: QuestionAttempt[]): SpeedAccuracyDistribution {
  const relevant = answered(attempts);
  const buckets: Record<SpeedAccuracyBucket, number> = {
    HIGH_ACCURACY_HIGH_SPEED: 0,
    HIGH_ACCURACY_LOW_SPEED: 0,
    LOW_ACCURACY_HIGH_SPEED: 0,
    LOW_ACCURACY_LOW_SPEED: 0,
  };
  if (relevant.length === 0) return { buckets, sampleSize: 0 };

  const counts: Record<SpeedAccuracyBucket, number> = {
    HIGH_ACCURACY_HIGH_SPEED: 0,
    HIGH_ACCURACY_LOW_SPEED: 0,
    LOW_ACCURACY_HIGH_SPEED: 0,
    LOW_ACCURACY_LOW_SPEED: 0,
  };

  for (const a of relevant) {
    const ratio = a.expectedTimeSeconds > 0 ? a.timeSpentSeconds / a.expectedTimeSeconds : 1;
    // Binary split at the expected-time mark: at or under budget counts as
    // "high speed", over budget as "low speed". (An earlier version used
    // separate fast/slow thresholds with a gap between them, which silently
    // classified on-pace answers as "low speed" by default.)
    const speedIsHigh = ratio <= 1.0;
    const key: SpeedAccuracyBucket = a.isCorrect
      ? speedIsHigh
        ? "HIGH_ACCURACY_HIGH_SPEED"
        : "HIGH_ACCURACY_LOW_SPEED"
      : speedIsHigh
        ? "LOW_ACCURACY_HIGH_SPEED"
        : "LOW_ACCURACY_LOW_SPEED";
    counts[key] += 1;
  }

  for (const key of Object.keys(counts) as SpeedAccuracyBucket[]) {
    buckets[key] = Math.round(pct(counts[key], relevant.length) * 10) / 10;
  }
  return { buckets, sampleSize: relevant.length };
}

// ---------------------------------------------------------------------------
// Section 10 — time allocation intelligence
// ---------------------------------------------------------------------------

export interface TimeAllocationInsight {
  totalTimeSpentSeconds: number;
  avgTimePerQuestionSeconds: number;
  timeByDifficulty: Record<string, number>;
  unansweredCount: number;
  /** Questions where heavy time investment did not convert to a correct
   * answer, expressed as a concrete, evidence-style observation rather than
   * a verdict. Empty when nothing meets the threshold. */
  sinkObservations: string[];
}

export function analyzeTimeAllocation(attempts: QuestionAttempt[]): TimeAllocationInsight {
  const totalTimeSpentSeconds = attempts.reduce((s, a) => s + a.timeSpentSeconds, 0);
  const avgTimePerQuestionSeconds = attempts.length ? totalTimeSpentSeconds / attempts.length : 0;

  const byDifficulty: Record<string, number[]> = {};
  for (const a of attempts) {
    (byDifficulty[a.difficulty] ??= []).push(a.timeSpentSeconds);
  }
  const timeByDifficulty: Record<string, number> = {};
  for (const [diff, times] of Object.entries(byDifficulty)) {
    timeByDifficulty[diff] = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  }

  const unansweredCount = attempts.filter((a) => a.finalStatus === "unanswered").length;

  // Time sinks: spent materially more than expected (>=1.75x) and it still
  // didn't convert (wrong or abandoned), *and* at least one later question in
  // the sequence went unanswered — this is the concrete pattern from Section
  // 10's worked example, not a generic "you were slow" observation.
  const sinks = attempts.filter(
    (a) =>
      a.expectedTimeSeconds > 0 &&
      a.timeSpentSeconds / a.expectedTimeSeconds >= 1.75 &&
      a.isCorrect !== true // heavy time investment that did NOT convert (wrong, skipped, or unanswered)
  );

  const sinkObservations: string[] = [];
  for (const sink of sinks) {
    const laterUnanswered = attempts.filter(
      (a) => a.sequencePosition > sink.sequencePosition && a.finalStatus === "unanswered"
    );
    if (laterUnanswered.length > 0) {
      const mins = Math.floor(sink.timeSpentSeconds / 60);
      const secs = sink.timeSpentSeconds % 60;
      sinkObservations.push(
        `Spent ${mins}m ${secs}s on a ${sink.difficulty} question (question ${sink.sequencePosition}), ` +
          `then left ${laterUnanswered.length} later question${laterUnanswered.length === 1 ? "" : "s"} unanswered.`
      );
    }
  }

  return { totalTimeSpentSeconds, avgTimePerQuestionSeconds, timeByDifficulty, unansweredCount, sinkObservations };
}

// ---------------------------------------------------------------------------
// Section 11 — question selection intelligence
// ---------------------------------------------------------------------------

export type SelectionQuality = "EFFECTIVE" | "INEFFICIENT" | "MISSED_OPPORTUNITY";

export interface QuestionSelectionResult {
  score: number; // 0-100, share of decisions classified EFFECTIVE
  sampleSize: number;
  breakdown: Record<SelectionQuality, number>;
}

/**
 * Judges the *decision*, not the difficulty of the question — a skip is only
 * penalized when the pattern around it (fast skip + never revisited on a
 * question that wasn't hard, while time clearly remained) suggests the skip
 * itself was the issue, not the question (Section 11: "Do not judge a
 * decision as wrong merely because the question was difficult").
 */
export function analyzeQuestionSelection(attempts: QuestionAttempt[]): QuestionSelectionResult {
  const breakdown: Record<SelectionQuality, number> = { EFFECTIVE: 0, INEFFICIENT: 0, MISSED_OPPORTUNITY: 0 };
  if (attempts.length === 0) return { score: 0, sampleSize: 0, breakdown };

  const avgOtherTimeRatio = (excludeSeq: number) => {
    const others = attempts.filter((a) => a.sequencePosition !== excludeSeq && a.expectedTimeSeconds > 0);
    if (others.length === 0) return 1;
    return others.reduce((s, a) => s + a.timeSpentSeconds / a.expectedTimeSeconds, 0) / others.length;
  };

  let classified = 0;
  for (const a of attempts) {
    const ratio = a.expectedTimeSeconds > 0 ? a.timeSpentSeconds / a.expectedTimeSeconds : 1;

    if (a.finalStatus === "answered" && a.isCorrect === true && ratio <= 1.3) {
      breakdown.EFFECTIVE += 1;
      classified += 1;
      continue;
    }
    if (a.revisitCount > 0 && a.finalStatus === "answered" && a.isCorrect === true) {
      // Skipped earlier, came back with a clear head, got it right.
      breakdown.EFFECTIVE += 1;
      classified += 1;
      continue;
    }
    if (ratio >= 1.5 && (a.isCorrect === false || a.finalStatus !== "answered")) {
      breakdown.INEFFICIENT += 1;
      classified += 1;
      continue;
    }
    if (
      a.finalStatus === "unanswered" &&
      a.revisitCount === 0 &&
      ratio < 0.5 &&
      a.difficulty !== "hard" &&
      avgOtherTimeRatio(a.sequencePosition) < 1.2 // time genuinely wasn't the constraint elsewhere
    ) {
      breakdown.MISSED_OPPORTUNITY += 1;
      classified += 1;
      continue;
    }
    // Anything not matching a clear pattern is left unclassified rather than
    // forced into a bucket — an ambiguous decision is not evidence of a good
    // or bad one.
  }

  const score = classified > 0 ? Math.round(pct(breakdown.EFFECTIVE, classified)) : 0;
  return { score, sampleSize: classified, breakdown };
}

// ---------------------------------------------------------------------------
// Sections 12-13 — topic switching
// ---------------------------------------------------------------------------

export interface TopicSwitchingResult {
  postSwitchAccuracy: number | null;
  steadyStateAccuracy: number | null;
  accuracyCost: number | null; // steadyState - postSwitch, positive = real cost
  postSwitchAvgTimeRatio: number | null; // relative to expected time
  steadyStateAvgTimeRatio: number | null;
  switchCount: number;
  hasGap: boolean;
  observation: string | null;
}

export function analyzeTopicSwitching(attempts: QuestionAttempt[]): TopicSwitchingResult {
  const sorted = [...attempts].sort((a, b) => a.sequencePosition - b.sequencePosition);
  const postSwitch: QuestionAttempt[] = [];
  const steadyState: QuestionAttempt[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev || !cur) continue;
    if (cur.topicId !== prev.topicId) {
      postSwitch.push(cur);
    } else {
      steadyState.push(cur);
    }
  }

  const acc = (arr: QuestionAttempt[]) => {
    const a = answered(arr);
    return a.length ? pct(a.filter((x) => x.isCorrect).length, a.length) : null;
  };
  const timeRatio = (arr: QuestionAttempt[]) => {
    const withTime = arr.filter((x) => x.expectedTimeSeconds > 0);
    return withTime.length
      ? withTime.reduce((s, x) => s + x.timeSpentSeconds / x.expectedTimeSeconds, 0) / withTime.length
      : null;
  };

  const postSwitchAccuracy = acc(postSwitch);
  const steadyStateAccuracy = acc(steadyState);
  const accuracyCost =
    postSwitchAccuracy !== null && steadyStateAccuracy !== null
      ? Math.round((steadyStateAccuracy - postSwitchAccuracy) * 10) / 10
      : null;

  const hasGap = accuracyCost !== null && accuracyCost >= 10 && postSwitch.length >= 3;

  return {
    postSwitchAccuracy,
    steadyStateAccuracy,
    accuracyCost,
    postSwitchAvgTimeRatio: timeRatio(postSwitch),
    steadyStateAvgTimeRatio: timeRatio(steadyState),
    switchCount: postSwitch.length,
    hasGap,
    observation: hasGap
      ? `Accuracy drops from ${steadyStateAccuracy?.toFixed(0)}% on same-topic questions to ` +
        `${postSwitchAccuracy?.toFixed(0)}% immediately after a topic transition, across ${postSwitch.length} transitions.`
      : null,
  };
}

// ---------------------------------------------------------------------------
// Section 16 — recovery performance
// ---------------------------------------------------------------------------

export interface RecoveryResult {
  postErrorRecoveryRate: number | null; // % of answers in the 1-3 questions after a wrong answer that are correct
  errorEventCount: number;
  longestPostErrorMissStreak: number;
}

export function analyzeRecovery(attempts: QuestionAttempt[], lookahead = 3): RecoveryResult {
  const sorted = [...attempts].sort((a, b) => a.sequencePosition - b.sequencePosition);
  const answeredSorted = sorted.filter((a) => a.finalStatus === "answered" && a.isCorrect !== null);

  let followUpsCorrect = 0;
  let followUpsTotal = 0;
  let errorEventCount = 0;
  let longestPostErrorMissStreak = 0;

  for (let i = 0; i < answeredSorted.length; i++) {
    const cur = answeredSorted[i];
    if (!cur || cur.isCorrect !== false) continue;
    errorEventCount += 1;

    let missStreak = 0;
    for (let j = i + 1; j < Math.min(i + 1 + lookahead, answeredSorted.length); j++) {
      const follow = answeredSorted[j];
      if (!follow) continue;
      followUpsTotal += 1;
      if (follow.isCorrect) {
        followUpsCorrect += 1;
        missStreak = 0;
      } else {
        missStreak += 1;
        longestPostErrorMissStreak = Math.max(longestPostErrorMissStreak, missStreak);
      }
    }
  }

  return {
    postErrorRecoveryRate: followUpsTotal > 0 ? Math.round(pct(followUpsCorrect, followUpsTotal)) : null,
    errorEventCount,
    longestPostErrorMissStreak,
  };
}

// ---------------------------------------------------------------------------
// Section 15 — end-of-assessment degradation
// ---------------------------------------------------------------------------

export interface DegradationResult {
  firstQuarterAccuracy: number | null;
  middleHalfAccuracy: number | null;
  finalQuarterAccuracy: number | null;
  hasDegradation: boolean;
  supportingSignals: string[];
}

export function analyzeEndOfAssessmentDegradation(attempts: QuestionAttempt[]): DegradationResult {
  const sorted = [...attempts].sort((a, b) => a.sequencePosition - b.sequencePosition);
  const n = sorted.length;
  if (n < 4) {
    return {
      firstQuarterAccuracy: null,
      middleHalfAccuracy: null,
      finalQuarterAccuracy: null,
      hasDegradation: false,
      supportingSignals: [],
    };
  }

  const q1End = Math.round(n * 0.25);
  const q4Start = Math.round(n * 0.75);
  const first = sorted.slice(0, q1End);
  const middle = sorted.slice(q1End, q4Start);
  const last = sorted.slice(q4Start);

  const acc = (arr: QuestionAttempt[]) => {
    const a = answered(arr);
    return a.length ? pct(a.filter((x) => x.isCorrect).length, a.length) : null;
  };
  const avgTimeRatio = (arr: QuestionAttempt[]) => {
    const withTime = arr.filter((x) => x.expectedTimeSeconds > 0);
    return withTime.length
      ? withTime.reduce((s, x) => s + x.timeSpentSeconds / x.expectedTimeSeconds, 0) / withTime.length
      : null;
  };

  const firstQuarterAccuracy = acc(first);
  const middleHalfAccuracy = acc(middle);
  const finalQuarterAccuracy = acc(last);

  const hasDegradation =
    firstQuarterAccuracy !== null && finalQuarterAccuracy !== null && firstQuarterAccuracy - finalQuarterAccuracy >= 12;

  const supportingSignals: string[] = [];
  if (hasDegradation) {
    const firstTime = avgTimeRatio(first);
    const lastTime = avgTimeRatio(last);
    if (firstTime !== null && lastTime !== null && lastTime > firstTime * 1.15) {
      supportingSignals.push("Average time per question rises in the final section.");
    }
    const lastUnanswered = last.filter((a) => a.finalStatus === "unanswered").length;
    const firstUnanswered = first.filter((a) => a.finalStatus === "unanswered").length;
    if (lastUnanswered > firstUnanswered) {
      supportingSignals.push(`${lastUnanswered} unanswered question(s) in the final section vs ${firstUnanswered} in the first.`);
    }
    supportingSignals.push(
      `Accuracy declines from ${firstQuarterAccuracy?.toFixed(0)}% in the first section to ` +
        `${finalQuarterAccuracy?.toFixed(0)}% in the final section.`
    );
  }

  return { firstQuarterAccuracy, middleHalfAccuracy, finalQuarterAccuracy, hasDegradation, supportingSignals };
}

// ---------------------------------------------------------------------------
// Aggregate accuracy/timing used by several engines
// ---------------------------------------------------------------------------

export function overallAccuracy(attempts: QuestionAttempt[]): number | null {
  const a = answered(attempts);
  return a.length ? pct(a.filter((x) => x.isCorrect).length, a.length) : null;
}
