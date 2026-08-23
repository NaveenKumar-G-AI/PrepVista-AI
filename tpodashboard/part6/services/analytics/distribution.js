'use strict';

const { summaryStats, buildHistogram, cleanNumbers } = require('./statUtils');

/**
 * Section 49: "Respect privacy when group sizes are very small." Rather
 * than leaving that as a UI-layer reminder, it's enforced right here: any
 * group under `minGroupSize` gets `suppressed: true` and NO stats at all
 * (not even a min/max, which could still de-anonymize a group of 2-3
 * students). The caller decides what to show instead (e.g. "Fewer than 5
 * students - not shown").
 *
 * @param {number[]} ctcMinorValues
 * @param {{minGroupSize?: number, bucketCount?: number}} [opts]
 */
function getCtcDistribution(ctcMinorValues, { minGroupSize = 5, bucketCount = 6 } = {}) {
  const values = cleanNumbers(ctcMinorValues);
  if (values.length < minGroupSize) {
    return { suppressed: true, reason: 'GROUP_TOO_SMALL', count: values.length, minGroupSize };
  }
  return {
    suppressed: false,
    ...summaryStats(values),
    histogram: buildHistogram(values, bucketCount),
  };
}

module.exports = { getCtcDistribution };
