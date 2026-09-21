import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriority } from '../src/engine/priorityEngine';

test('breakdown contributions sum to the total score', () => {
  const { score, breakdown } = computePriority({
    priorityTier: 'CRITICAL',
    gapStatus: 'GAP',
    required: true,
    blockingPowerNormalized: 0.5,
    daysRemaining: 30,
    trend: 'DECLINING',
  });
  const sum = breakdown.role.contribution + breakdown.gap.contribution + breakdown.block.contribution + breakdown.required.contribution + breakdown.urgency.contribution + breakdown.trend.contribution;
  assert.ok(Math.abs(sum - score) < 1e-9);
  assert.ok(Math.abs(breakdown.total - score) < 1e-9);
});

test('higher gap severity strictly increases priority, all else equal', () => {
  const base = { priorityTier: 'HIGH' as const, required: true, blockingPowerNormalized: 0.2, daysRemaining: null, trend: null };
  const developing = computePriority({ ...base, gapStatus: 'DEVELOPING' }).score;
  const gap = computePriority({ ...base, gapStatus: 'GAP' }).score;
  const critical = computePriority({ ...base, gapStatus: 'CRITICAL_GAP' }).score;
  assert.ok(developing < gap);
  assert.ok(gap < critical);
});

test('higher blocking power strictly increases priority, all else equal', () => {
  const base = { priorityTier: 'MEDIUM' as const, gapStatus: 'GAP' as const, required: true, daysRemaining: null, trend: null };
  const low = computePriority({ ...base, blockingPowerNormalized: 0.1 }).score;
  const high = computePriority({ ...base, blockingPowerNormalized: 0.9 }).score;
  assert.ok(low < high);
});

test('a CRITICAL role skill outranks a LOW-priority skill with the same gap severity', () => {
  const base = { gapStatus: 'GAP' as const, required: true, blockingPowerNormalized: 0.3, daysRemaining: null, trend: null };
  const low = computePriority({ ...base, priorityTier: 'LOW' }).score;
  const critical = computePriority({ ...base, priorityTier: 'CRITICAL' }).score;
  assert.ok(low < critical);
});

test('UNKNOWN is treated as moderate priority — neither the lowest nor the highest', () => {
  const base = { priorityTier: 'HIGH' as const, required: true, blockingPowerNormalized: 0.2, daysRemaining: null, trend: null };
  const unknown = computePriority({ ...base, gapStatus: 'UNKNOWN' }).score;
  const complete = computePriority({ ...base, gapStatus: 'COMPLETE' }).score;
  const critical = computePriority({ ...base, gapStatus: 'CRITICAL_GAP' }).score;
  assert.ok(unknown > complete);
  assert.ok(unknown < critical);
});

test('urgency only meaningfully amplifies REQUIRED skills under deadline pressure', () => {
  const requiredScore = computePriority({ priorityTier: 'MEDIUM', gapStatus: 'GAP', required: true, blockingPowerNormalized: 0.2, daysRemaining: 3, trend: null }).score;
  const optionalScore = computePriority({ priorityTier: 'MEDIUM', gapStatus: 'GAP', required: false, blockingPowerNormalized: 0.2, daysRemaining: 3, trend: null }).score;
  assert.ok(requiredScore > optionalScore);
});
