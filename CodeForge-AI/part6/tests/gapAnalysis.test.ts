import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGap, resolveSchedulingStatus } from '../src/engine/gapAnalysis';
import { emptyMasteryState } from '../src/engine/masteryUpdate';
import type { MasteryState } from '../src/domain/types';

const sid = 'student1';
const skid = 'skillA';

test('zero evidence classifies as UNKNOWN, never as a weak status', () => {
  const state = emptyMasteryState(sid, skid);
  assert.equal(classifyGap(state, 'COMPETENT', true), 'UNKNOWN');
});

test('mastery below target on a required skill with a 1-level gap is GAP', () => {
  const state: MasteryState = { studentId: sid, skillId: skid, masteryLevel: 'DEVELOPING', confidence: 0.5, evidenceCount: 3, trend: 'STABLE', recentOutcomes: [], lastEvidenceAt: null };
  assert.equal(classifyGap(state, 'COMPETENT', true), 'GAP');
});

test('mastery below target on an optional skill with a 1-level gap is DEVELOPING (not urgent)', () => {
  const state: MasteryState = { studentId: sid, skillId: skid, masteryLevel: 'DEVELOPING', confidence: 0.5, evidenceCount: 3, trend: 'STABLE', recentOutcomes: [], lastEvidenceAt: null };
  assert.equal(classifyGap(state, 'COMPETENT', false), 'DEVELOPING');
});

test('a 2+ level gap is CRITICAL_GAP regardless of required flag', () => {
  const state: MasteryState = { studentId: sid, skillId: skid, masteryLevel: 'NOVICE', confidence: 0.4, evidenceCount: 2, trend: 'STABLE', recentOutcomes: [], lastEvidenceAt: null };
  assert.equal(classifyGap(state, 'STRONG', true), 'CRITICAL_GAP');
});

test('rank at or above target with very thin evidence is INSUFFICIENT_EVIDENCE, not COMPLETE', () => {
  const state: MasteryState = { studentId: sid, skillId: skid, masteryLevel: 'COMPETENT', confidence: 0.2, evidenceCount: 1, trend: null, recentOutcomes: ['SUCCESS'], lastEvidenceAt: null };
  assert.equal(classifyGap(state, 'COMPETENT', true), 'INSUFFICIENT_EVIDENCE');
});

test('rank at or above target with solid evidence is COMPLETE', () => {
  const state: MasteryState = { studentId: sid, skillId: skid, masteryLevel: 'COMPETENT', confidence: 0.6, evidenceCount: 4, trend: 'STABLE', recentOutcomes: [], lastEvidenceAt: null };
  assert.equal(classifyGap(state, 'COMPETENT', true), 'COMPLETE');
});

test('resolveSchedulingStatus marks an otherwise-tractable gap as BLOCKED when prerequisites are not ready', () => {
  assert.equal(resolveSchedulingStatus('GAP', false), 'BLOCKED');
});

test('resolveSchedulingStatus passes through COMPLETE regardless of prerequisite readiness', () => {
  assert.equal(resolveSchedulingStatus('COMPLETE', false), 'COMPLETE');
});

test('resolveSchedulingStatus passes through the own status when prerequisites are ready', () => {
  assert.equal(resolveSchedulingStatus('CRITICAL_GAP', true), 'CRITICAL_GAP');
});
