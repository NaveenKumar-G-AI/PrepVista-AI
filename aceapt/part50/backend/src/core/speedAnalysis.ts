// Core speed measurement: classifies a single attempt, computes evidence-based
// personal baselines, and resolves "expected time" without ever inventing a
// number (spec sections 7-11, 27-28, 45, 106, 116-117, 135-136, 138).

import {
  EvidenceConfidence,
  ExpectedTimeSource,
  NoveltyLevel,
  ScopeKey,
  SpeedAttemptRecord,
  SpeedBaseline,
  SpeedPerformanceState,
} from '../types/domain';

/** Below this ratio of actual/expected time, an attempt counts as "fast". */
export const FAST_RATIO = 0.85;
/** Above this ratio, an attempt counts as "slow". Between the two = on pace. */
export const SLOW_RATIO = 1.15;

export const MIN_SAMPLES_LOW = 3;
export const MIN_SAMPLES_MEDIUM = 8;
export const MIN_SAMPLES_HIGH = 20;

export interface SpeedStateResult {
  relativeSpeed: number | null;
  state: SpeedPerformanceState;
}

/** Classifies ONE attempt. Never draw a conclusion (bottleneck, mode switch,
 * "regression") from a single call to this function - aggregate first. */
export function classifySpeedState(
  actualTimeMs: number,
  expectedTimeMs: number | null,
  correct: boolean,
): SpeedStateResult {
  if (expectedTimeMs === null || expectedTimeMs <= 0) {
    return { relativeSpeed: null, state: SpeedPerformanceState.INSUFFICIENT_DATA };
  }

  const relativeSpeed = actualTimeMs / expectedTimeMs;

  if (relativeSpeed <= FAST_RATIO) {
    return {
      relativeSpeed,
      state: correct ? SpeedPerformanceState.FAST_ACCURATE : SpeedPerformanceState.FAST_INACCURATE,
    };
  }
  if (relativeSpeed >= SLOW_RATIO) {
    return {
      relativeSpeed,
      state: correct ? SpeedPerformanceState.SLOW_ACCURATE : SpeedPerformanceState.SLOW_INACCURATE,
    };
  }
  return {
    relativeSpeed,
    state: correct ? SpeedPerformanceState.ON_PACE_ACCURATE : SpeedPerformanceState.ON_PACE_INACCURATE,
  };
}

function confidenceForSampleSize(n: number): EvidenceConfidence {
  if (n >= MIN_SAMPLES_HIGH) return 'HIGH';
  if (n >= MIN_SAMPLES_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export interface BaselineOptions {
  /** Default true - hint-assisted time is not fluency evidence (spec 45, 116-117). */
  independentOnly?: boolean;
  /** Scope the baseline to one novelty tier so familiar speed is never
   * silently compared against novel/transfer speed (spec 104, 135). */
  novelty?: NoveltyLevel;
}

/** Returns null (not a fabricated number) when there isn't enough evidence. */
export function computeBaseline(
  scope: ScopeKey,
  attempts: SpeedAttemptRecord[],
  opts: BaselineOptions = {},
): SpeedBaseline | null {
  const independentOnly = opts.independentOnly ?? true;
  let pool = independentOnly ? attempts.filter((a) => a.independent && a.hintLevel === 0) : attempts;
  if (opts.novelty) pool = pool.filter((a) => a.noveltyLevel === opts.novelty);
  if (pool.length < MIN_SAMPLES_LOW) return null;

  const times = pool.map((a) => a.responseTimeMs).sort((a, b) => a - b);
  const average = times.reduce((sum, t) => sum + t, 0) / times.length;
  const median =
    times.length % 2 === 0
      ? (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : times[Math.floor(times.length / 2)];
  const accuracy = pool.filter((a) => a.correct).length / pool.length;

  return {
    scope,
    sampleSize: pool.length,
    averageMs: Math.round(average),
    medianMs: Math.round(median),
    accuracy,
    confidence: confidenceForSampleSize(pool.length),
    updatedAt: new Date(),
  };
}

export interface ExpectedTimeResolution {
  expectedTimeMs: number | null;
  source: ExpectedTimeSource;
}

/** Priority: calibrated data from the platform (Feature 42/43) > the
 * student's own evidenced baseline > unknown. Never a hard-coded guess
 * (spec 9, 76: "do not invent arbitrary expected times"). */
export function resolveExpectedTime(params: {
  calibratedExpectedTimeMs?: number | null;
  personalBaseline?: SpeedBaseline | null;
  minSampleSizeForBaseline?: number;
}): ExpectedTimeResolution {
  const minSample = params.minSampleSizeForBaseline ?? MIN_SAMPLES_LOW;

  if (params.calibratedExpectedTimeMs && params.calibratedExpectedTimeMs > 0) {
    return { expectedTimeMs: params.calibratedExpectedTimeMs, source: 'CALIBRATED' };
  }
  if (params.personalBaseline && params.personalBaseline.sampleSize >= minSample) {
    return { expectedTimeMs: params.personalBaseline.averageMs, source: 'PERSONAL_BASELINE' };
  }
  return { expectedTimeMs: null, source: 'UNKNOWN' };
}

/** Structural guardrail against unfair comparisons (spec 8, 13, 102, 138):
 * groups attempts by skill+difficulty so an Easy time is never averaged
 * together with a Hard time. */
export function groupByScope(attempts: SpeedAttemptRecord[]): Map<string, SpeedAttemptRecord[]> {
  const groups = new Map<string, SpeedAttemptRecord[]>();
  for (const attempt of attempts) {
    const key = `SKILL:${attempt.question.skillId}:${attempt.question.difficulty}`;
    const list = groups.get(key) ?? [];
    list.push(attempt);
    groups.set(key, list);
  }
  return groups;
}

/** Separates hint-assisted attempts from independent solving so "fluency"
 * claims are always about independent speed (spec 45, 100, 116-117). */
export function splitByIndependence(attempts: SpeedAttemptRecord[]): {
  independent: SpeedAttemptRecord[];
  assisted: SpeedAttemptRecord[];
} {
  return {
    independent: attempts.filter((a) => a.independent && a.hintLevel === 0),
    assisted: attempts.filter((a) => !a.independent || a.hintLevel > 0),
  };
}
