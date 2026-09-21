import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNarrative } from '../src/ai/narrative.js';
import { TemplateProvider } from '../src/ai/provider.js';
import type { AIProvider, NarrativeInput } from '../src/ai/provider.js';
import { SKILLS } from '../src/domain/taxonomy.js';
import type { StudentSkillState } from '../src/domain/types.js';

const skill = SKILLS.find((s) => s.id === 'skl_pct_app')!;
const state: StudentSkillState = {
  studentId: 'demo-student-1',
  skillId: skill.id,
  capability: 'DEVELOPING',
  evidenceStrength: 'MODERATE',
  foundation: { state: 'STRONG', evidenceCount: 4 },
  application: { state: 'DEVELOPING', evidenceCount: 4 },
  transfer: { state: 'LIMITED_EVIDENCE', evidenceCount: 0 },
  freshness: 'FRESH',
  lastVerifiedAt: null,
  gapTypes: ['APPLICATION_GAP'],
  priorityScore: 1,
  priorityBreakdown: null,
  calcVersion: 1,
  updatedAt: '',
};
const evidence = [
  {
    id: 'ev1',
    studentId: 'demo-student-1',
    skillId: skill.id,
    role: 'primary_skill' as const,
    questionId: 'q',
    questionAttemptId: 'a',
    correct: false,
    difficulty: 3,
    cognitiveLevel: 'application' as const,
    timeTakenMs: 1000,
    expectedTimeMs: 1000,
    source: 'practice' as const,
    sessionId: 's1',
    createdAt: new Date().toISOString(),
  },
];
const input: NarrativeInput = { skill, state, evidence, hint: 'general' };

test('the template provider always produces valid, on-topic output', async () => {
  const insight = await generateNarrative('demo-student-1', new TemplateProvider(), input);
  assert.equal(insight.generatedBy, 'template');
  assert.equal(insight.skillId, skill.id);
  assert.equal(insight.validated, true);
});

test('a provider returning malformed output falls back to the template', async () => {
  const badProvider: AIProvider = {
    name: 'broken-ai',
    async generateInsight() {
      return { findingType: 'general' }; // missing required fields
    },
  };
  const insight = await generateNarrative('demo-student-1', badProvider, input);
  assert.equal(insight.generatedBy, 'template');
});

test('a provider that throws falls back to the template instead of erroring the request', async () => {
  const crashingProvider: AIProvider = {
    name: 'crashing-ai',
    async generateInsight() {
      throw new Error('upstream timeout');
    },
  };
  const insight = await generateNarrative('demo-student-1', crashingProvider, input);
  assert.equal(insight.generatedBy, 'template');
});

test('a provider citing evidence that is not the student\'s gets rejected and falls back', async () => {
  const dishonestProvider: AIProvider = {
    name: 'dishonest-ai',
    async generateInsight(i: NarrativeInput) {
      return {
        findingType: 'general',
        skillId: i.skill.id,
        evidenceIds: ['ev_not_real'],
        interpretation: 'fabricated',
        confidence: 0.9,
        recommendedFocus: false,
        studentMessage: 'trust me',
      };
    },
  };
  const insight = await generateNarrative('demo-student-1', dishonestProvider, input);
  assert.equal(insight.generatedBy, 'template');
});

test('a provider hallucinating a different skill id gets rejected and falls back', async () => {
  const wrongSkillProvider: AIProvider = {
    name: 'wrong-skill-ai',
    async generateInsight() {
      return {
        findingType: 'general',
        skillId: 'not-a-real-skill-id',
        evidenceIds: [],
        interpretation: 'x',
        confidence: 0.5,
        recommendedFocus: false,
        studentMessage: 'x',
      };
    },
  };
  const insight = await generateNarrative('demo-student-1', wrongSkillProvider, input);
  assert.equal(insight.generatedBy, 'template');
  assert.equal(insight.skillId, skill.id);
});
