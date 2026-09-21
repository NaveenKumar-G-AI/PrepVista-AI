import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCapabilityDna } from '../engine/capabilityDna';
import { calculateAlignment } from '../engine/alignmentEngine';
import { TARGET_PROFILES_SEED } from '../config/targetProfiles.seed';
import { CapabilityEvidenceEvent } from '../domain/types';

const DATA_ANALYST = TARGET_PROFILES_SEED.find((t) => t.targetId === 'data_analyst')!;
const NOW = new Date('2026-08-28T00:00:00Z');

function strongRecentEvents(capabilityId: string, count = 5): CapabilityEvidenceEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    capabilityId,
    performance: 0.9,
    occurredAt: new Date(NOW.getTime() - i * 3 * 24 * 60 * 60 * 1000).toISOString(),
    difficulty: 0.5 + (i % 3) * 0.15,
    novelty: 0.6,
    timed: true,
    proofVerified: true,
  }));
}

test('raw evidence events flow through Capability DNA into a real alignment result', () => {
  const capabilities = [
    'quant_reasoning',
    'data_interpretation',
    'logical_reasoning',
    'technical_fundamentals',
    'communication',
    'programming',
    'pattern_recognition',
  ];

  const evidenceByCapability = Object.fromEntries(
    capabilities.map((id) => [id, strongRecentEvents(id)]),
  );

  const dna = buildCapabilityDna('student-pipeline', evidenceByCapability, NOW);

  assert.equal(dna.entries.length, 7);
  assert.ok(dna.entries.every((e) => e.confidence.band === 'HIGH'), 'five recent varied-difficulty verified attempts should read HIGH confidence');

  const result = calculateAlignment(dna, DATA_ANALYST, [], NOW);

  assert.notEqual(result.state, 'INSUFFICIENT_EVIDENCE');
  assert.ok(result.fitScore !== null && result.fitScore >= 80, `expected strong fit, got ${result.fitScore}`);
  assert.equal(result.criticalGaps.length, 0);
});

test('a capability the student has never attempted is simply absent from Capability DNA, not defaulted to a level', () => {
  const dna = buildCapabilityDna('student-partial', {
    quant_reasoning: strongRecentEvents('quant_reasoning'),
  }, NOW);

  assert.equal(dna.entries.length, 1);
  assert.equal(dna.entries.find((e) => e.capabilityId === 'data_interpretation'), undefined);

  const result = calculateAlignment(dna, DATA_ANALYST, [], NOW);
  // data_interpretation is CORE and has zero evidence -> must be insufficient, never a guessed low score passed off as measured.
  assert.equal(result.state, 'INSUFFICIENT_EVIDENCE');
});
