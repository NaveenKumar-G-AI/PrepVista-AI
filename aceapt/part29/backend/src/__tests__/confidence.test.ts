import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvidenceConfidence } from '../engine/confidence';
import { CapabilityEvidenceEvent } from '../domain/types';

const NOW = new Date('2026-08-28T00:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

test('no evidence => LOW band, zero score', () => {
  const result = calculateEvidenceConfidence([], NOW);
  assert.equal(result.band, 'LOW');
  assert.equal(result.score, 0);
  assert.equal(result.attemptCount, 0);
});

test('single recent, verified, timed event => MEDIUM band (hand-derived ~0.579)', () => {
  const events: CapabilityEvidenceEvent[] = [
    {
      capabilityId: 'quant_reasoning',
      performance: 0.9,
      occurredAt: daysAgo(0),
      difficulty: 0.7,
      novelty: 0.6,
      timed: true,
      proofVerified: true,
    },
  ];
  const result = calculateEvidenceConfidence(events, NOW);
  assert.equal(result.band, 'MEDIUM');
  assert.ok(
    Math.abs(result.score - 0.5787) < 0.01,
    `expected score near 0.579, got ${result.score}`,
  );
});

test('one old, unverified, untimed, low-difficulty event => LOW band (hand-derived ~0.181)', () => {
  const events: CapabilityEvidenceEvent[] = [
    {
      capabilityId: 'quant_reasoning',
      performance: 0.5,
      occurredAt: daysAgo(180),
      difficulty: 0.1,
      novelty: 0.1,
      timed: false,
      proofVerified: false,
    },
  ];
  const result = calculateEvidenceConfidence(events, NOW);
  assert.equal(result.band, 'LOW');
  assert.ok(
    Math.abs(result.score - 0.1812) < 0.01,
    `expected score near 0.181, got ${result.score}`,
  );
});

test('six recent, verified, difficulty-varied, consistent events => HIGH band (hand-derived ~0.895)', () => {
  const difficulties = [0.2, 0.35, 0.5, 0.65, 0.8, 0.9];
  const events: CapabilityEvidenceEvent[] = difficulties.map((difficulty) => ({
    capabilityId: 'quant_reasoning',
    performance: 0.8,
    occurredAt: daysAgo(0),
    difficulty,
    novelty: 0.6,
    timed: true,
    proofVerified: true,
  }));
  const result = calculateEvidenceConfidence(events, NOW);
  assert.equal(result.band, 'HIGH');
  assert.ok(
    Math.abs(result.score - 0.895) < 0.01,
    `expected score near 0.895, got ${result.score}`,
  );
  assert.equal(result.attemptCount, 6);
  assert.equal(result.proofVerifiedCount, 6);
});
