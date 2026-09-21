import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEvidenceStrength, rawAccuracySignal, signalToCapability, capCapability } from '../src/engine/capability.js';
import type { SkillEvidence } from '../src/domain/types.js';

function makeEvidence(n: number, correctCount: number, sessionCount: number): SkillEvidence[] {
  const out: SkillEvidence[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `e${i}`,
      studentId: 's',
      skillId: 'sk',
      role: 'primary_skill',
      questionId: `q${i}`,
      questionAttemptId: `a${i}`,
      correct: i < correctCount,
      difficulty: (i % 3) + 1,
      cognitiveLevel: 'application',
      timeTakenMs: 1000,
      expectedTimeMs: 1000,
      source: 'practice',
      sessionId: `sess${i % sessionCount}`,
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}

test('evidence strength: two points in one session is LOW', () => {
  assert.equal(computeEvidenceStrength(makeEvidence(2, 2, 1)), 'LOW');
});

test('evidence strength: six points across three sessions and mixed difficulty is HIGH', () => {
  assert.equal(computeEvidenceStrength(makeEvidence(6, 6, 3)), 'HIGH');
});

test('capability is capped by evidence tier — two correct answers cannot reach Mastered', () => {
  const ev = makeEvidence(2, 2, 1); // perfect, but LOW evidence
  const tier = computeEvidenceStrength(ev);
  const raw = signalToCapability(rawAccuracySignal(ev));
  const capped = capCapability(raw, tier);
  assert.equal(tier, 'LOW');
  assert.notEqual(capped, 'MASTERED');
  assert.equal(['NOT_ASSESSED', 'LIMITED_EVIDENCE', 'EMERGING'].includes(capped), true);
});

test('capability can reach Strong or higher once evidence is HIGH and accuracy is strong', () => {
  const ev = makeEvidence(6, 6, 3);
  const tier = computeEvidenceStrength(ev);
  const raw = signalToCapability(rawAccuracySignal(ev));
  const capped = capCapability(raw, tier);
  assert.equal(tier, 'HIGH');
  assert.equal(['STRONG', 'ADVANCED', 'VERIFIED', 'MASTERED'].includes(capped), true);
});

test('zero evidence is Not Assessed, not a score of zero', () => {
  const tier = computeEvidenceStrength([]);
  assert.equal(tier, 'NONE');
  assert.equal(capCapability('NOT_ASSESSED', tier), 'NOT_ASSESSED');
});
