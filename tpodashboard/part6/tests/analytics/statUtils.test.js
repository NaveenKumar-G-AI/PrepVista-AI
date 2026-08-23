'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { mean, percentileOfSorted, summaryStats, buildHistogram } = require('../../services/analytics/statUtils');
const { getCtcDistribution } = require('../../services/analytics/distribution');

describe('statUtils', () => {
  test('mean of an empty array is null, not NaN', () => {
    assert.equal(mean([]), null);
  });

  test('percentileOfSorted interpolates between ranks', () => {
    const sorted = [10, 20, 30, 40];
    assert.equal(percentileOfSorted(sorted, 0), 10);
    assert.equal(percentileOfSorted(sorted, 100), 40);
    assert.equal(percentileOfSorted(sorted, 50), 25); // between 20 and 30
  });

  test('summaryStats on an empty array returns nulls with count 0, never throws', () => {
    const s = summaryStats([]);
    assert.equal(s.count, 0);
    assert.equal(s.mean, null);
    assert.equal(s.median, null);
  });

  test('summaryStats computes median correctly for odd and even counts', () => {
    assert.equal(summaryStats([1, 2, 3]).median, 2);
    assert.equal(summaryStats([1, 2, 3, 4]).median, 2.5);
  });

  test('summaryStats ignores non-numeric / non-finite entries rather than throwing', () => {
    const s = summaryStats([10, null, undefined, NaN, 20]);
    assert.equal(s.count, 2);
    assert.equal(s.mean, 15);
  });

  test('buildHistogram buckets sum to the total count', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const hist = buildHistogram(values, 5);
    const total = hist.reduce((acc, b) => acc + b.count, 0);
    assert.equal(total, values.length);
    assert.equal(hist.length, 5);
  });

  test('buildHistogram collapses to one bucket when every value is identical', () => {
    const hist = buildHistogram([5, 5, 5], 6);
    assert.equal(hist.length, 1);
    assert.equal(hist[0].count, 3);
  });
});

describe('getCtcDistribution privacy suppression', () => {
  test('suppresses a group smaller than minGroupSize - no stats leak, not even min/max', () => {
    const result = getCtcDistribution([800000, 900000, 750000], { minGroupSize: 5 });
    assert.equal(result.suppressed, true);
    assert.equal(result.reason, 'GROUP_TOO_SMALL');
    assert.equal('median' in result, false);
    assert.equal('min' in result, false);
  });

  test('computes full stats once the group meets minGroupSize', () => {
    const values = [500000, 600000, 700000, 800000, 900000];
    const result = getCtcDistribution(values, { minGroupSize: 5 });
    assert.equal(result.suppressed, false);
    assert.equal(result.count, 5);
    assert.equal(result.median, 700000);
    assert.ok(Array.isArray(result.histogram));
  });
});
