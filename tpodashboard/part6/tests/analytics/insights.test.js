'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMultipleOffersInsight,
  buildStaleVerificationInsight,
  buildSegmentDeviationInsight,
} = require('../../services/analytics/insights');

describe('buildMultipleOffersInsight', () => {
  test('2 active offers is MEDIUM priority; 3+ is HIGH', () => {
    const two = buildMultipleOffersInsight('s1', [
      { id: 'o1', acceptanceDeadline: '2026-08-20T00:00:00.000Z' },
      { id: 'o2', acceptanceDeadline: '2026-08-18T00:00:00.000Z' },
    ]);
    assert.equal(two.priority, 'MEDIUM');
    assert.equal(two.evidence.earliest_deadline, '2026-08-18T00:00:00.000Z');

    const three = buildMultipleOffersInsight('s1', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    assert.equal(three.priority, 'HIGH');
  });
});

describe('buildStaleVerificationInsight', () => {
  test('computes hours stuck and escalates priority past 120h', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    const under = buildStaleVerificationInsight({ id: 'o1' }, '2026-08-11T00:00:00.000Z', now); // 96h
    assert.equal(under.evidence.hours_in_verification, 96);
    assert.equal(under.priority, 'MEDIUM');

    const over = buildStaleVerificationInsight({ id: 'o2' }, '2026-08-09T00:00:00.000Z', now); // 144h
    assert.equal(over.priority, 'HIGH');
  });
});

describe('buildSegmentDeviationInsight', () => {
  test('reports the measured deviation without asserting a cause', () => {
    const insight = buildSegmentDeviationInsight({
      dimensionLabel: 'department',
      dimensionValue: 'ECE',
      metricName: 'acceptanceRate',
      rate: 0.4,
      benchmarkRate: 0.7,
    });
    assert.ok(Math.abs(insight.evidence.deviation - -0.3) < 1e-9);
    assert.equal(insight.priority, 'HIGH');
    assert.doesNotMatch(insight.recommended_action, /because|caused by|due to/i);
  });

  test('a small deviation is MEDIUM priority, not HIGH', () => {
    const insight = buildSegmentDeviationInsight({
      dimensionLabel: 'company',
      dimensionValue: 'X',
      metricName: 'declineRate',
      rate: 0.32,
      benchmarkRate: 0.28,
    });
    assert.equal(insight.priority, 'MEDIUM');
  });
});
