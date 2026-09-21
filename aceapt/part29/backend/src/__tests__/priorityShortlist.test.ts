import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetPriorityShortlist } from '../engine/priorityShortlist';
import { AlignmentResult } from '../domain/types';

function stubResult(targetId: string, targetName: string, fit: number | null, readiness: number | null): AlignmentResult {
  return {
    studentId: 'student-x',
    targetId,
    targetName,
    calculatedAt: new Date().toISOString(),
    state: fit === null ? 'INSUFFICIENT_EVIDENCE' : fit >= 80 ? 'STRONGLY_ALIGNED' : 'DEVELOPING_ALIGNMENT',
    fitScore: fit,
    readinessScore: readiness,
    confidence: 'HIGH',
    strengths: [],
    criticalGaps: [],
    supportingGaps: [],
    nextBestAction: null,
    insufficientEvidenceCapabilities: [],
    insufficientEvidenceReason: null,
    explanationFacts: {
      targetName,
      state: 'DEVELOPING_ALIGNMENT',
      fitScore: fit,
      readinessScore: readiness,
      confidence: 'HIGH',
      topStrengths: [],
      criticalGapNames: [],
      supportingGapNames: [],
      nextBestActionCapability: null,
    },
  };
}

test('shortlist ranking matches the spec §22/§32 demo ordering and tiers', () => {
  const results = [
    stubResult('data_analyst', 'Data Analyst', 88, 72),
    stubResult('business_analyst', 'Business Analyst', 84, 69),
    stubResult('software_developer', 'Software Developer', 70, 61),
  ];
  const { shortlist } = buildTargetPriorityShortlist(results);

  assert.equal(shortlist.length, 3);
  assert.equal(shortlist[0]?.targetId, 'data_analyst');
  assert.equal(shortlist[0]?.tier, 'PRIMARY');
  assert.equal(shortlist[1]?.targetId, 'business_analyst');
  assert.equal(shortlist[1]?.tier, 'SECONDARY');
  assert.equal(shortlist[2]?.targetId, 'software_developer');
  assert.equal(shortlist[2]?.tier, 'STRETCH');
});

test('targets without enough evidence are excluded from the ranked list and reported separately', () => {
  const results = [
    stubResult('data_analyst', 'Data Analyst', 88, 72),
    stubResult('ai_ml', 'AI/ML', null, null),
  ];
  const { shortlist, awaitingEvidence } = buildTargetPriorityShortlist(results);

  assert.equal(shortlist.length, 1);
  assert.equal(awaitingEvidence.length, 1);
  assert.equal(awaitingEvidence[0]?.targetId, 'ai_ml');
});

test('a target that typically needs far more prep time than is available can drop below a closer-ranked one', () => {
  const results = [
    stubResult('cloud_devops', 'Cloud/DevOps', 82, 60),
    stubResult('technical_support', 'Technical Support', 78, 58),
  ];
  const prepWeeks = { cloud_devops: 14, technical_support: 6 };

  const { shortlist } = buildTargetPriorityShortlist(results, prepWeeks, { availableWeeks: 8 });

  assert.equal(shortlist[0]?.targetId, 'technical_support');
  assert.equal(shortlist[0]?.tier, 'PRIMARY');
  assert.ok(shortlist.find((s) => s.targetId === 'cloud_devops')?.reason.includes('more time'));
});
