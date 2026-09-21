import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness } from '../src/engine/readinessModel';
import type { MasteryState, RoleCompetency } from '../src/domain/types';

function competency(skillId: string, overrides: Partial<RoleCompetency> = {}): RoleCompetency {
  return {
    id: `rc_${skillId}`,
    roleId: 'role1',
    skillId,
    priority: 'HIGH',
    targetMastery: 'COMPETENT',
    required: true,
    weight: 1,
    sequenceHint: null,
    description: null,
    ...overrides,
  };
}

function mastery(skillId: string, level: MasteryState['masteryLevel'], confidence: number, evidenceCount: number): MasteryState {
  return { studentId: 's1', skillId, masteryLevel: level, confidence, evidenceCount, trend: 'STABLE', recentOutcomes: [], lastEvidenceAt: null };
}

test('a brand-new student with zero evidence reads as NOT_STARTED', () => {
  const competencies = [competency('a'), competency('b')];
  const states = new Map<string, MasteryState>();
  const categories = new Map([
    ['a', 'Cat1'],
    ['b', 'Cat1'],
  ]);
  const result = computeReadiness(competencies, states, categories, 'INTERVIEW_READY', false);
  assert.equal(result.state, 'NOT_STARTED');
  assert.equal(result.gatePassed, false);
});

test('a high composite score WITHOUT recent verification is capped below READY', () => {
  const competencies = [competency('a'), competency('b'), competency('c')];
  const states = new Map<string, MasteryState>([
    ['a', mastery('a', 'COMPETENT', 0.9, 5)],
    ['b', mastery('b', 'COMPETENT', 0.9, 5)],
    ['c', mastery('c', 'COMPETENT', 0.9, 5)],
  ]);
  const categories = new Map([
    ['a', 'Cat1'],
    ['b', 'Cat1'],
    ['c', 'Cat1'],
  ]);
  const result = computeReadiness(competencies, states, categories, 'INTERVIEW_READY', false);
  assert.notEqual(result.state, 'READY');
  assert.notEqual(result.state, 'STRONG');
  assert.equal(result.gatePassed, false);
  assert.ok(result.gateUnmetReasons.some((r) => r.includes('verification')));
});

test('a high composite score WITH recent verification and sufficient confidence can reach READY', () => {
  const competencies = [competency('a'), competency('b'), competency('c')];
  const states = new Map<string, MasteryState>([
    ['a', mastery('a', 'COMPETENT', 0.9, 5)],
    ['b', mastery('b', 'COMPETENT', 0.9, 5)],
    ['c', mastery('c', 'COMPETENT', 0.9, 5)],
  ]);
  const categories = new Map([
    ['a', 'Cat1'],
    ['b', 'Cat1'],
    ['c', 'Cat1'],
  ]);
  const result = computeReadiness(competencies, states, categories, 'INTERVIEW_READY', true);
  assert.equal(result.gatePassed, true);
  assert.ok(result.state === 'READY' || result.state === 'STRONG');
});

test('dimensions are grouped by category and independently scored', () => {
  const competencies = [competency('a', { targetMastery: 'COMPETENT' }), competency('b', { targetMastery: 'COMPETENT' })];
  const states = new Map<string, MasteryState>([
    ['a', mastery('a', 'MASTERED', 0.9, 5)],
    ['b', mastery('b', 'NOVICE', 0.9, 5)],
  ]);
  const categories = new Map([
    ['a', 'Strong Category'],
    ['b', 'Weak Category'],
  ]);
  const result = computeReadiness(competencies, states, categories, 'INTERVIEW_READY', true);
  const strongDim = result.dimensionScores.find((d) => d.dimension === 'Strong Category')!;
  const weakDim = result.dimensionScores.find((d) => d.dimension === 'Weak Category')!;
  assert.ok(strongDim.score > weakDim.score);
});
