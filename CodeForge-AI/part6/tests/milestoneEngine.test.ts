import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCompletionConditions, evaluateMilestone, nextMilestoneStatus } from '../src/engine/milestoneEngine';
import type { EvidenceEvent, RoadmapSkill } from '../src/domain/types';

function skill(overrides: Partial<RoadmapSkill> = {}): RoadmapSkill {
  return {
    id: 'rs1',
    roadmapMilestoneId: 'm1',
    skillId: 'skillA',
    skillName: 'Skill A',
    required: true,
    priorityScore: 0.5,
    priorityBreakdown: {
      role: { value: 0, weight: 0, contribution: 0 },
      gap: { value: 0, weight: 0, contribution: 0 },
      block: { value: 0, weight: 0, contribution: 0 },
      required: { value: 0, weight: 0, contribution: 0 },
      urgency: { value: 0, weight: 0, contribution: 0 },
      trend: { value: 0, weight: 0, contribution: 0 },
      total: 0,
    },
    gapStatus: 'COMPLETE',
    targetMastery: 'COMPETENT',
    currentMasterySnapshot: 'COMPETENT',
    activityType: 'PRACTICE',
    learningObjective: 'test',
    sequence: 0,
    insertedReason: null,
    ...overrides,
  };
}

function ev(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return { studentId: 's1', skillId: 'skillA', source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true, ...overrides };
}

test('a high raw count of non-independent, non-verifying attempts does NOT complete a milestone', () => {
  const skills = [skill({ gapStatus: 'COMPLETE' })];
  const evidence = new Map<string, EvidenceEvent[]>([
    ['skillA', Array.from({ length: 20 }, () => ev({ independent: false }))], // 20 "questions completed", none independent
  ]);
  const result = evaluateMilestone(skills, defaultCompletionConditions(), evidence);
  assert.equal(result.complete, false);
  assert.ok(result.unmet.some((u) => u.includes('independent')));
});

test('milestone completes only once required skills are at target, evidence is sufficient, and verification passed', () => {
  const skills = [skill({ gapStatus: 'COMPLETE' })];
  const evidence = new Map<string, EvidenceEvent[]>([
    [
      'skillA',
      [ev({ independent: true }), ev({ independent: true }), ev({ source: 'VERIFICATION', independent: true, outcome: 'SUCCESS' })],
    ],
  ]);
  const result = evaluateMilestone(skills, defaultCompletionConditions(), evidence);
  assert.equal(result.complete, true);
  assert.deepEqual(result.unmet, []);
});

test('required skill not yet at target blocks completion even with plenty of evidence', () => {
  const skills = [skill({ gapStatus: 'GAP' })];
  const evidence = new Map<string, EvidenceEvent[]>([
    ['skillA', [ev(), ev(), ev({ source: 'VERIFICATION', outcome: 'SUCCESS' })]],
  ]);
  const result = evaluateMilestone(skills, defaultCompletionConditions(), evidence);
  assert.equal(result.complete, false);
});

test('nextMilestoneStatus stays LOCKED when prerequisite milestones are not completed, regardless of evaluation', () => {
  const evaluation = { complete: true, readyForVerification: false, unmet: [] };
  assert.equal(nextMilestoneStatus('AVAILABLE', false, evaluation, false), 'LOCKED');
});

test('nextMilestoneStatus moves a COMPLETED milestone to NEEDS_REASSESSMENT if its skill set changed', () => {
  const evaluation = { complete: true, readyForVerification: false, unmet: [] };
  assert.equal(nextMilestoneStatus('COMPLETED', true, evaluation, true), 'NEEDS_REASSESSMENT');
});

test('nextMilestoneStatus reports READY_FOR_VERIFICATION distinctly from COMPLETED', () => {
  const evaluation = { complete: false, readyForVerification: true, unmet: ['no independent VERIFICATION-source success recorded yet'] };
  assert.equal(nextMilestoneStatus('IN_PROGRESS', true, evaluation, false), 'READY_FOR_VERIFICATION');
});
