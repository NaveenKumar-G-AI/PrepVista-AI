import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGaps, detectSpeedIssue } from '../src/engine/gaps.js';
import type { SkillEvidence } from '../src/domain/types.js';

test('insufficient evidence when fewer than 2 data points', () => {
  const gaps = detectGaps({
    evidenceCount: 1,
    foundation: { state: 'LIMITED_EVIDENCE', evidenceCount: 1 },
    application: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    speedIssue: false,
    isContradictory: false,
    freshness: 'FRESH',
    wasStrongBefore: false,
  });
  assert.deepEqual(gaps, ['INSUFFICIENT_EVIDENCE']);
});

test('application gap: solid foundation, weak application', () => {
  const gaps = detectGaps({
    evidenceCount: 6,
    foundation: { state: 'STRONG', evidenceCount: 4 },
    application: { state: 'DEVELOPING', evidenceCount: 4 },
    transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    speedIssue: false,
    isContradictory: false,
    freshness: 'FRESH',
    wasStrongBefore: false,
  });
  assert.equal(gaps.includes('APPLICATION_GAP'), true);
  assert.equal(gaps.includes('KNOWLEDGE_GAP'), false);
});

test('gaps can co-occur: application + speed together', () => {
  const gaps = detectGaps({
    evidenceCount: 6,
    foundation: { state: 'STRONG', evidenceCount: 4 },
    application: { state: 'DEVELOPING', evidenceCount: 4 },
    transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    speedIssue: true,
    isContradictory: false,
    freshness: 'FRESH',
    wasStrongBefore: false,
  });
  assert.equal(gaps.includes('APPLICATION_GAP'), true);
  assert.equal(gaps.includes('SPEED_GAP'), true);
});

test('a missed hard question inside a steady streak does not by itself trigger a gap', () => {
  const gaps = detectGaps({
    evidenceCount: 5,
    foundation: { state: 'STRONG', evidenceCount: 5 },
    application: { state: 'SOLID', evidenceCount: 3 },
    transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    speedIssue: false,
    isContradictory: false,
    freshness: 'FRESH',
    wasStrongBefore: false,
  });
  assert.deepEqual(gaps, []);
});

test('speed issue requires both a time overrun and reasonable accuracy', () => {
  const base = {
    id: 'e',
    studentId: 's',
    skillId: 'sk',
    role: 'primary_skill' as const,
    questionId: 'q',
    source: 'practice' as const,
    sessionId: 's1',
    createdAt: new Date().toISOString(),
    cognitiveLevel: 'application' as const,
  };
  const slowButAccurate: SkillEvidence[] = [
    { ...base, questionAttemptId: 'a1', correct: true, difficulty: 3, timeTakenMs: 150000, expectedTimeMs: 90000 },
    { ...base, questionAttemptId: 'a2', correct: true, difficulty: 3, timeTakenMs: 140000, expectedTimeMs: 90000 },
  ];
  assert.equal(detectSpeedIssue(slowButAccurate), true);

  const slowAndWrong: SkillEvidence[] = [
    { ...base, questionAttemptId: 'a3', correct: false, difficulty: 3, timeTakenMs: 150000, expectedTimeMs: 90000 },
    { ...base, questionAttemptId: 'a4', correct: false, difficulty: 3, timeTakenMs: 140000, expectedTimeMs: 90000 },
  ];
  assert.equal(detectSpeedIssue(slowAndWrong), false);
});
