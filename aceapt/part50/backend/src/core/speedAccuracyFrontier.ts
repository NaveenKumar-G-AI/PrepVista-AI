// Speed/Accuracy Frontier + Safe Speed Zone (spec sections 110-111).
//
// The frontier buckets a student's own independent attempts by response
// time and reports accuracy per bucket - never a decorative chart (spec
// 110 explicitly forbids that): every point requires a minimum sample
// size, and the whole frontier requires enough total evidence before it
// renders at all. The safe zone is the widest contiguous time range where
// accuracy holds at/above the guardrail - "42-55 sec" in the spec's own
// example - derived from that same evidence, never asserted outright.

import { SpeedAttemptRecord } from '../types/domain';

export interface FrontierPoint {
  avgTimeMs: number;
  accuracy: number;
  sampleSize: number;
}

export interface SafeSpeedZone {
  minMs: number;
  maxMs: number;
  guardrail: number;
}

const MIN_BUCKET_SAMPLES = 3;
const MIN_TOTAL_SAMPLES_FOR_FRONTIER = 15;
const DEFAULT_BUCKET_COUNT = 5;

/** Buckets independent attempts into roughly-equal-size, time-sorted
 * groups and reports (avg time, accuracy) per bucket. Returns [] rather
 * than a guessed shape when there isn't enough spread of evidence yet. */
export function computeSpeedAccuracyFrontier(attempts: SpeedAttemptRecord[], bucketCount: number = DEFAULT_BUCKET_COUNT): FrontierPoint[] {
  const independent = attempts.filter((a) => a.independent && a.hintLevel === 0);
  if (independent.length < MIN_TOTAL_SAMPLES_FOR_FRONTIER) return [];

  const sorted = [...independent].sort((a, b) => a.responseTimeMs - b.responseTimeMs);
  const effectiveBuckets = Math.min(bucketCount, Math.floor(sorted.length / MIN_BUCKET_SAMPLES));
  if (effectiveBuckets < 2) return [];

  const bucketSize = Math.floor(sorted.length / effectiveBuckets);
  const points: FrontierPoint[] = [];

  for (let i = 0; i < effectiveBuckets; i += 1) {
    const start = i * bucketSize;
    const end = i === effectiveBuckets - 1 ? sorted.length : start + bucketSize;
    const bucket = sorted.slice(start, end);
    if (bucket.length < MIN_BUCKET_SAMPLES) continue;

    const avgTimeMs = bucket.reduce((sum, a) => sum + a.responseTimeMs, 0) / bucket.length;
    const accuracy = bucket.filter((a) => a.correct).length / bucket.length;
    points.push({ avgTimeMs: Math.round(avgTimeMs), accuracy, sampleSize: bucket.length });
  }

  return points;
}

/** The widest contiguous run of frontier buckets at/above the guardrail.
 * Returns null (not a fabricated range) when no such run exists yet. */
export function computeSafeSpeedZone(frontier: FrontierPoint[], guardrail: number): SafeSpeedZone | null {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < frontier.length; i += 1) {
    if (frontier[i].accuracy >= guardrail) {
      if (curStart === -1) curStart = i;
      curLen += 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestStart === -1) return null;

  const zoneBuckets = frontier.slice(bestStart, bestStart + bestLen);
  const times = zoneBuckets.map((b) => b.avgTimeMs);
  return { minMs: Math.min(...times), maxMs: Math.max(...times), guardrail };
}
