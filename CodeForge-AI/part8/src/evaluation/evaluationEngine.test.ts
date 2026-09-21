import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateDimension, buildEvaluation, computeInterviewReadinessContribution, DimensionResult } from './evaluationEngine';

test('PHASE 52 — a dimension with no evidence is INSUFFICIENT_EVIDENCE, never WEAK', () => {
  const result = rateDimension({ dimension: 'DATA_STRUCTURE_SELECTION' });
  assert.equal(result.rating, 'INSUFFICIENT_EVIDENCE');
  assert.notEqual(result.rating, 'WEAK');
});

test('a deterministic-only dimension never needs an AI opinion', () => {
  const result = rateDimension({
    dimension: 'CODING_CORRECTNESS',
    evidence: { deterministicRating: 'STRONG', deterministicSummary: 'all tests passed on first submit' },
  });
  assert.equal(result.rating, 'STRONG');
});

test('PHASE 51 — strong coding but developing complexity reasoning is APPROACHING_READY, not READY', () => {
  const dims: DimensionResult[] = [
    { dimension: 'CODING_CORRECTNESS', rating: 'STRONG', evidenceSummary: 'all tests passed' },
    { dimension: 'DEBUGGING', rating: 'STRONG', evidenceSummary: 'recovered from failure independently' },
    { dimension: 'TIME_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting to state Big-O' },
    { dimension: 'SPACE_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting' },
  ];
  const evaluation = buildEvaluation(dims, true);
  const readiness = computeInterviewReadinessContribution(evaluation);
  assert.notEqual(readiness.readinessLabel, 'READY');
  assert.equal(readiness.readinessLabel, 'APPROACHING_READY');
  assert.match(readiness.reason, /TIME_COMPLEXITY/);
});

test('PHASE 51 — weak debugging blocks READY even when everything else is strong', () => {
  const dims: DimensionResult[] = [
    { dimension: 'CODING_CORRECTNESS', rating: 'STRONG', evidenceSummary: '' },
    { dimension: 'DEBUGGING', rating: 'WEAK', evidenceSummary: 'could not diagnose the failure unaided' },
    { dimension: 'TIME_COMPLEXITY', rating: 'STRONG', evidenceSummary: '' },
    { dimension: 'SPACE_COMPLEXITY', rating: 'STRONG', evidenceSummary: '' },
  ];
  const evaluation = buildEvaluation(dims, true);
  const readiness = computeInterviewReadinessContribution(evaluation);
  assert.equal(readiness.readinessLabel, 'NOT_READY');
});

test('fully strong core dimensions produce READY with HIGH confidence', () => {
  const dims: DimensionResult[] = (['CODING_CORRECTNESS', 'DEBUGGING', 'TIME_COMPLEXITY', 'SPACE_COMPLEXITY'] as const)
    .map(dimension => ({ dimension, rating: 'STRONG' as const, evidenceSummary: '' }));
  const readiness = computeInterviewReadinessContribution(buildEvaluation(dims, false));
  assert.equal(readiness.readinessLabel, 'READY');
  assert.equal(readiness.confidence, 'HIGH');
});

test('no evidence at all for any required dimension is INSUFFICIENT_EVIDENCE, not NOT_READY', () => {
  const readiness = computeInterviewReadinessContribution(buildEvaluation([], false));
  assert.equal(readiness.readinessLabel, 'INSUFFICIENT_EVIDENCE');
});
