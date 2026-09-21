import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRoadmaps, matchMilestone, type PrevSkillSnapshot } from '../src/engine/recalculation';
import type { DraftMilestone, DraftRoadmapSkill } from '../src/engine/roadmapGenerator';

const emptyBreakdown = {
  role: { value: 0, weight: 0, contribution: 0 },
  gap: { value: 0, weight: 0, contribution: 0 },
  block: { value: 0, weight: 0, contribution: 0 },
  required: { value: 0, weight: 0, contribution: 0 },
  urgency: { value: 0, weight: 0, contribution: 0 },
  trend: { value: 0, weight: 0, contribution: 0 },
  total: 0,
};

function draftSkill(skillId: string, gapStatus: DraftRoadmapSkill['gapStatus'], overrides: Partial<DraftRoadmapSkill> = {}): DraftRoadmapSkill {
  return {
    skillId,
    skillName: skillId,
    required: true,
    priorityScore: 0.5,
    priorityBreakdown: emptyBreakdown,
    gapStatus,
    targetMastery: 'COMPETENT',
    currentMasterySnapshot: null,
    activityType: 'PRACTICE',
    learningObjective: 'x',
    sequence: 0,
    insertedReason: null,
    ...overrides,
  };
}

function milestone(skills: DraftRoadmapSkill[]): DraftMilestone {
  return { sequence: 0, name: 'M', description: '', skills, completionConditions: { requiredSkillsAtTarget: true, minConfidence: 0.6, minIndependentEvidencePerRequiredSkill: 2, verificationRequired: true } };
}

test('an identical roadmap produces no material change', () => {
  const prev: PrevSkillSnapshot[] = [{ skillId: 'debugging', skillName: 'Debugging', gapStatus: 'GAP' }];
  const next = [milestone([draftSkill('debugging', 'GAP')])];
  const { materialChange } = diffRoadmaps(prev, next);
  assert.equal(materialChange, false);
});

test('a newly inserted prerequisite skill is flagged as materially different and appears in skillsInserted', () => {
  const prev: PrevSkillSnapshot[] = [{ skillId: 'graphs', skillName: 'Graphs', gapStatus: 'UNKNOWN' }];
  const next = [milestone([draftSkill('graphs', 'UNKNOWN'), draftSkill('queues', 'GAP', { insertedReason: 'Inserted as a prerequisite of BFS' })])];
  const { materialChange, diff } = diffRoadmaps(prev, next);
  assert.equal(materialChange, true);
  assert.equal(diff.skillsInserted.length, 1);
  assert.equal(diff.skillsInserted[0].skillId, 'queues');
});

test('a skill reaching COMPLETE is recorded in skillsCompleted', () => {
  const prev: PrevSkillSnapshot[] = [{ skillId: 'debugging', skillName: 'Debugging', gapStatus: 'GAP' }];
  const next = [milestone([draftSkill('debugging', 'COMPLETE')])];
  const { diff } = diffRoadmaps(prev, next);
  assert.equal(diff.skillsCompleted.length, 1);
  assert.equal(diff.skillsCompleted[0].skillId, 'debugging');
});

test('UNKNOWN turning into an active GAP after evidence is recorded as a regression', () => {
  const prev: PrevSkillSnapshot[] = [{ skillId: 'queues', skillName: 'Queues', gapStatus: 'UNKNOWN' }];
  const next = [milestone([draftSkill('queues', 'GAP')])];
  const { diff } = diffRoadmaps(prev, next);
  assert.equal(diff.skillsRegressed.length, 1);
  assert.equal(diff.skillsRegressed[0].from, 'UNKNOWN');
  assert.equal(diff.skillsRegressed[0].to, 'GAP');
});

test('matchMilestone finds the best-overlapping previous milestone above the similarity threshold', () => {
  const prevMilestones = [
    { id: 'm1', status: 'IN_PROGRESS', skillIds: ['a', 'b', 'c'] },
    { id: 'm2', status: 'LOCKED', skillIds: ['x', 'y'] },
  ];
  const match = matchMilestone(['a', 'b', 'c', 'd'], prevMilestones);
  assert.equal(match?.id, 'm1');
});

test('matchMilestone returns null when no previous milestone overlaps enough', () => {
  const prevMilestones = [{ id: 'm1', status: 'IN_PROGRESS', skillIds: ['a', 'b'] }];
  const match = matchMilestone(['z', 'y', 'x'], prevMilestones);
  assert.equal(match, null);
});
