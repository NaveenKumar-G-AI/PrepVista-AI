'use strict';

/**
 * Pure math helpers. No knowledge of offers, students, or anything
 * PrepVista-specific lives here - just numbers in, numbers out - so
 * every function is trivially unit-testable and reusable for CTC,
 * timing, or any other numeric distribution.
 */

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** `sortedValues` must already be sorted ascending. Linear interpolation between ranks. */
function percentileOfSorted(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

function cleanNumbers(values) {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

/**
 * count/mean/median/min/max/p25/p75/stdDev in one pass. Returns nulls
 * (not zeros or exceptions) for an empty input - callers should check
 * `count` before trusting the rest, same convention as
 * distribution.js's `suppressed` flag.
 */
function summaryStats(values) {
  const sorted = cleanNumbers(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null, p25: null, p75: null, stdDev: null };
  }
  const m = mean(sorted);
  const variance = sorted.reduce((acc, v) => acc + (v - m) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    mean: m,
    median: percentileOfSorted(sorted, 50),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: percentileOfSorted(sorted, 25),
    p75: percentileOfSorted(sorted, 75),
    stdDev: Math.sqrt(variance),
  };
}

/** Equal-width histogram. A single distinct value collapses to one bucket rather than dividing by zero. */
function buildHistogram(values, bucketCount = 6) {
  const sorted = cleanNumbers(values).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [{ rangeStart: min, rangeEnd: max, count: sorted.length }];

  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    rangeStart: min + i * width,
    rangeEnd: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of sorted) {
    const idx = Math.min(Math.floor((v - min) / width), bucketCount - 1);
    buckets[idx].count += 1;
  }
  return buckets;
}

module.exports = { mean, percentileOfSorted, cleanNumbers, summaryStats, buildHistogram };
