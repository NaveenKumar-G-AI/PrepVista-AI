import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainPerceptionInsight } from '../src/engine/perception.js';
import { SKILLS } from '../src/domain/taxonomy.js';
import type { StudentSkillState } from '../src/domain/types.js';

function state(overrides: Partial<StudentSkillState> & Pick<StudentSkillState, 'skillId' | 'capability' | 'evidenceStrength'>): StudentSkillState {
  return {
    studentId: 's',
    foundation: { state: 'STRONG', evidenceCount: 4 },
    application: { state: 'STRONG', evidenceCount: 4 },
    transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
    freshness: 'FRESH',
    lastVerifiedAt: null,
    gapTypes: [],
    priorityScore: null,
    priorityBreakdown: null,
    calcVersion: 1,
    updatedAt: '',
    ...overrides,
  };
}

test('hidden strength: self-rated weak, observed strong', () => {
  const skill = SKILLS.find((s) => s.id === 'skl_log_reasoning')!;
  const result = domainPerceptionInsight('weak', [{ skill, state: state({ skillId: skill.id, capability: 'STRONG', evidenceStrength: 'HIGH' }) }]);
  assert.equal(result?.category, 'hidden_strength');
  assert.equal(result?.skillId, skill.id);
});

test('overconfidence flag: self-rated strong, observed weak', () => {
  const skill = SKILLS.find((s) => s.id === 'skl_pct_app')!;
  const result = domainPerceptionInsight('strong', [
    { skill, state: state({ skillId: skill.id, capability: 'DEVELOPING', evidenceStrength: 'MODERATE', gapTypes: ['APPLICATION_GAP'] }) },
  ]);
  assert.equal(result?.category, 'overconfidence_flag');
  assert.equal(result?.skillId, skill.id);
});

test('calibrated: self-rating matches observed performance', () => {
  const skill = SKILLS.find((s) => s.id === 'skl_ratio')!;
  const result = domainPerceptionInsight('strong', [{ skill, state: state({ skillId: skill.id, capability: 'STRONG', evidenceStrength: 'HIGH' }) }]);
  assert.equal(result?.category, 'calibrated');
});

test('no evidence at all yields no insight, rather than a guess', () => {
  const skill = SKILLS.find((s) => s.id === 'skl_data_suff')!;
  const result = domainPerceptionInsight('weak', [{ skill, state: state({ skillId: skill.id, capability: 'NOT_ASSESSED', evidenceStrength: 'NONE' }) }]);
  assert.equal(result, null);
});
