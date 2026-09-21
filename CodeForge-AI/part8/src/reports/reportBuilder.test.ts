import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewReport } from './reportBuilder';
import { buildEvaluation, computeInterviewReadinessContribution, DimensionResult } from '../evaluation/evaluationEngine';

test("what-to-improve text is grounded in the dimension's own evidence summary, not generic", () => {
  const dims: DimensionResult[] = [
    { dimension: 'CODING_CORRECTNESS', rating: 'STRONG', evidenceSummary: 'all tests passed on first submit' },
    { dimension: 'DEBUGGING', rating: 'STRONG', evidenceSummary: 'recovered from failure independently' },
    { dimension: 'TIME_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting to state Big-O for the hash map lookup' },
    { dimension: 'SPACE_COMPLEXITY', rating: 'STRONG', evidenceSummary: '' },
  ];
  const evaluation = buildEvaluation(dims, true);
  const readiness = computeInterviewReadinessContribution(evaluation);
  const report = buildInterviewReport({
    interviewId: 'i1', targetRole: 'Software Engineer', interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
    completedAt: new Date().toISOString(), evaluation, readiness, keyEvents: [],
  });

  assert.equal(report.whatToImprove.length, 1);
  assert.match(report.whatToImprove[0], /needed prompting to state Big-O for the hash map lookup/);
  assert.doesNotMatch(report.whatToImprove[0], /practice more coding/i);
});

test('PHASE 64 callback — a complexity gap produces a complexity-focused next action', () => {
  const dims: DimensionResult[] = [
    { dimension: 'CODING_CORRECTNESS', rating: 'STRONG', evidenceSummary: '' },
    { dimension: 'DEBUGGING', rating: 'STRONG', evidenceSummary: '' },
    { dimension: 'TIME_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting' },
    { dimension: 'SPACE_COMPLEXITY', rating: 'DEVELOPING', evidenceSummary: 'needed prompting' },
  ];
  const evaluation = buildEvaluation(dims, true);
  const readiness = computeInterviewReadinessContribution(evaluation);
  const report = buildInterviewReport({
    interviewId: 'i1', targetRole: 'Software Engineer', interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
    completedAt: new Date().toISOString(), evaluation, readiness, keyEvents: [],
  });

  assert.equal(report.overallReadiness, 'APPROACHING_READY');
  assert.match(report.nextRecommendedAction, /complexity/i);
  assert.match(report.roadmapImpact, /complexity/i);
});

test('key evidence only contains items derived from events actually passed in — nothing invented', () => {
  const evaluation = buildEvaluation([], false);
  const readiness = computeInterviewReadinessContribution(evaluation);
  const report = buildInterviewReport({
    interviewId: 'i1', targetRole: 'Software Engineer', interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
    completedAt: new Date().toISOString(), evaluation, readiness,
    keyEvents: [
      { id: 'e1', eventType: 'TEST_FAILED', payload: { testResults: [{ name: 'c1', passed: false }] }, createdAt: new Date().toISOString() },
      { id: 'e2', eventType: 'CODE_RUN', payload: {}, createdAt: new Date().toISOString() }, // not an evidence-worthy event type
    ],
  });

  assert.equal(report.keyEvidence.length, 1);
  assert.equal(report.keyEvidence[0].sourceEventId, 'e1');
});

test('a fully strong interview recommends continued practice, not a weakness-focused one', () => {
  const dims: DimensionResult[] = (['CODING_CORRECTNESS', 'DEBUGGING', 'TIME_COMPLEXITY', 'SPACE_COMPLEXITY'] as const)
    .map(dimension => ({ dimension, rating: 'STRONG' as const, evidenceSummary: '' }));
  const evaluation = buildEvaluation(dims, false);
  const readiness = computeInterviewReadinessContribution(evaluation);
  const report = buildInterviewReport({
    interviewId: 'i1', targetRole: 'Software Engineer', interviewType: 'GUIDED_TECHNICAL_INTERVIEW',
    completedAt: new Date().toISOString(), evaluation, readiness, keyEvents: [],
  });

  assert.equal(report.overallReadiness, 'READY');
  assert.match(report.nextInterviewRecommendation, /FINAL_READINESS_INTERVIEW/);
});
