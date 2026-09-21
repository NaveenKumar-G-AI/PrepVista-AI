import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriority, countDownstream } from '../src/engine/priority.js';
import { SKILLS, RELATIONSHIPS } from '../src/domain/taxonomy.js';

test('a skill with a real gap and downstream impact outranks an already-mastered skill', () => {
  const gappy = computePriority({
    skill: SKILLS.find((s) => s.id === 'skl_pct_app')!,
    state: { capability: 'DEVELOPING', evidenceStrength: 'MODERATE', gapTypes: ['APPLICATION_GAP'] },
    downstreamCount: 1,
    maxDownstreamCount: 1,
    targetDomains: ['Quantitative'],
    daysToTarget: 21,
  });
  const mastered = computePriority({
    skill: SKILLS.find((s) => s.id === 'skl_ratio')!,
    state: { capability: 'STRONG', evidenceStrength: 'HIGH', gapTypes: [] },
    downstreamCount: 1,
    maxDownstreamCount: 1,
    targetDomains: ['Quantitative'],
    daysToTarget: 21,
  });
  assert.ok(gappy.score > mastered.score, `expected ${gappy.score} > ${mastered.score}`);
  assert.ok(gappy.reasons.length > 0);
});

test('low evidence confidence dampens the score without zeroing it out', () => {
  const lowEvidence = computePriority({
    skill: SKILLS.find((s) => s.id === 'skl_pnl')!,
    state: { capability: 'EMERGING', evidenceStrength: 'LOW', gapTypes: ['APPLICATION_GAP'] },
    downstreamCount: 0,
    maxDownstreamCount: 1,
    targetDomains: ['Quantitative'],
    daysToTarget: 21,
  });
  assert.ok(lowEvidence.score > 0);
  assert.ok(lowEvidence.reasons.some((r) => r.toLowerCase().includes('provisional')));
});

test('downstream impact reflects the relationship graph', () => {
  assert.equal(countDownstream('skl_pct_fund', RELATIONSHIPS), 1); // pct_fund -> pct_app
  assert.equal(countDownstream('skl_vocab_context', RELATIONSHIPS), 0);
});
