/**
 * Section 52 QA requirements, expressed as tests: state transitions, gap
 * detection, and — most importantly — that the system never calls a skill
 * mastered from thin, repeated, or inconsistent evidence.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildEvidence } from '../src/engine/evidenceEngine';
import { analyzeEvidence } from '../src/engine/analysisEngine';
import { deriveState, deriveConfidence } from '../src/engine/stateEngine';
import { computeRootCause, computeBottlenecks } from '../src/engine/rootCauseEngine';
import { generateBlueprint, selectQuestions } from '../src/engine/masteryCheckEngine';
import { AttemptEvent, Question, Skill } from '../src/domain/types';

// ---------------------------------------------------------------- fixtures
const Q = (over: Partial<Question> & { id: string; skillId: string }): Question => ({
  prompt: '',
  difficulty: 'medium',
  format: 'direct',
  novelty: 'seen',
  context: 'basic',
  correctAnswer: 'x',
  ...over,
});

function A(over: Partial<AttemptEvent> & { questionId: string; skillId: string }, daysAgo = 0): AttemptEvent {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `a_${Math.random()}`,
    studentId: 's1',
    correct: true,
    independent: true,
    hintUsed: false,
    solutionViewed: false,
    retries: 0,
    responseTimeMs: 20000,
    timestamp: d.toISOString(),
    source: 'practice',
    ...over,
  };
}

function evaluate(skillId: string, attempts: AttemptEvent[], questions: Question[]) {
  const evidence = buildEvidence(skillId, attempts, new Map(questions.map((q) => [q.id, q])));
  const analysis = analyzeEvidence(evidence);
  const state = deriveState(evidence, analysis);
  const confidence = deriveConfidence(evidence, analysis);
  return { evidence, analysis, state, confidence };
}

// -------------------------------------------------------------- test data
const SKILL: Skill = { id: 'skill_a', domain: 'd', topic: 't', name: 'Skill A', prerequisiteIds: [] };

test('insufficient evidence never produces a confident mastery verdict', () => {
  const questions = [Q({ id: 'q1', skillId: 'skill_a' }), Q({ id: 'q2', skillId: 'skill_a' })];
  const attempts = [A({ questionId: 'q1', skillId: 'skill_a' }), A({ questionId: 'q2', skillId: 'skill_a' })];
  const { analysis, state, confidence } = evaluate('skill_a', attempts, questions);

  assert.equal(analysis.sufficiency, 'INSUFFICIENT');
  assert.ok(analysis.flags.includes('INSUFFICIENT_EVIDENCE'));
  assert.equal(confidence.confidence, 'LOW');
  assert.notEqual(state.state, 'ROBUST_MASTERY');
});

test('100% accuracy on a handful of attempts is NOT robust mastery (guards against small-N false positives)', () => {
  const questions = ['q1', 'q2', 'q3', 'q4'].map((id) => Q({ id, skillId: 'skill_a' }));
  const attempts = questions.map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: true }));
  const { state } = evaluate('skill_a', attempts, questions);

  assert.notEqual(state.state, 'ROBUST_MASTERY');
  assert.notEqual(state.state, 'TRANSFERRED');
  assert.notEqual(state.state, 'RETAINED');
  assert.notEqual(state.state, 'STABLE'); // not enough rolling windows yet to call it stable
});

test('repeating the same question does not substitute for distinct independent evidence', () => {
  const questions = [Q({ id: 'q1', skillId: 'skill_a' })];
  const attempts = Array.from({ length: 10 }, () => A({ questionId: 'q1', skillId: 'skill_a', correct: true }));
  const { evidence, state } = evaluate('skill_a', attempts, questions);

  assert.equal(evidence.independentDistinctQuestions, 1);
  assert.notEqual(state.state, 'INDEPENDENT');
  assert.notEqual(state.state, 'STABLE');
});

test('a large guided/independent gap blocks INDEPENDENT even with strong guided accuracy', () => {
  const questions = ['q1', 'q2', 'q3', 'q4'].map((id) => Q({ id, skillId: 'skill_a' }));
  const guided = questions.map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: true, independent: false, hintUsed: true }));
  // independent attempts on the *same* 4 questions, mostly wrong
  const independent = questions.map((q, i) => A({ questionId: q.id, skillId: 'skill_a', correct: i === 0, independent: true }));
  const { analysis, state } = evaluate('skill_a', [...guided, ...independent], questions);

  assert.ok(analysis.flags.includes('INDEPENDENCE_GAP'));
  assert.notEqual(state.state, 'INDEPENDENT');
});

test('an inconsistent score sequence blocks STABLE even when independent accuracy looks fine on average', () => {
  const questions = Array.from({ length: 8 }, (_, i) => Q({ id: `q${i}`, skillId: 'skill_a' }));
  // 90, 20, 90, 20, 90, 20, 90, 20 pattern -> ~55% avg but wildly inconsistent
  const pattern = [true, false, true, false, true, false, true, false];
  const attempts = questions.map((q, i) => A({ questionId: q.id, skillId: 'skill_a', correct: pattern[i] }));
  const { analysis, state } = evaluate('skill_a', attempts, questions);

  assert.notEqual(analysis.stability, 'STABLE');
  assert.notEqual(state.state, 'STABLE');
});

test('familiar-vs-novel transfer gap is detected and blocks TRANSFERRED', () => {
  const familiarQs = ['f1', 'f2', 'f3', 'f4'].map((id) => Q({ id, skillId: 'skill_a', novelty: 'similar' }));
  const novelQs = ['n1', 'n2', 'n3'].map((id) => Q({ id, skillId: 'skill_a', novelty: 'novel' }));
  const attempts = [
    ...familiarQs.map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: true })),
    ...novelQs.map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: false })),
  ];
  const { analysis, state } = evaluate('skill_a', attempts, [...familiarQs, ...novelQs]);

  assert.ok(analysis.flags.includes('TRANSFER_GAP'));
  assert.notEqual(state.state, 'TRANSFERRED');
  assert.notEqual(state.state, 'ROBUST_MASTERY');
});

test('a poor delayed retention check is flagged and blocks RETAINED', () => {
  const questions = Array.from({ length: 6 }, (_, i) => Q({ id: `q${i}`, skillId: 'skill_a' }));
  const immediate = questions.slice(0, 4).map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: true }, 20));
  const delayed = questions.slice(4).map((q) => A({ questionId: q.id, skillId: 'skill_a', correct: false, source: 'retention_check' }, 2));
  const { analysis, state } = evaluate('skill_a', [...immediate, ...delayed], questions);

  assert.ok(analysis.flags.includes('RETENTION_GAP'));
  assert.notEqual(state.state, 'RETAINED');
});

test('root cause points to a genuinely weak prerequisite, not just an under-evidenced one', () => {
  const parent: Skill = { id: 'advanced', domain: 'd', topic: 't', name: 'Advanced', prerequisiteIds: ['basic'] };
  const basic: Skill = { id: 'basic', domain: 'd', topic: 't', name: 'Basic', prerequisiteIds: [] };

  const basicQs = ['b1', 'b2', 'b3', 'b4'].map((id) => Q({ id, skillId: 'basic' }));
  const basicAttempts = basicQs.map((q, i) => A({ questionId: q.id, skillId: 'basic', correct: i < 1 })); // 1/4 = 25%, clearly weak

  const evidenceById = new Map([
    ['basic', buildEvidence('basic', basicAttempts, new Map(basicQs.map((q) => [q.id, q])))],
    ['advanced', buildEvidence('advanced', [], new Map())],
  ]);

  const rootCauses = computeRootCause('advanced', [parent, basic], evidenceById);
  assert.deepEqual(rootCauses, ['basic']);
});

test('an under-evidenced (not proven weak) prerequisite is not blamed as a root cause', () => {
  const parent: Skill = { id: 'advanced', domain: 'd', topic: 't', name: 'Advanced', prerequisiteIds: ['basic'] };
  const basic: Skill = { id: 'basic', domain: 'd', topic: 't', name: 'Basic', prerequisiteIds: [] };
  const basicQs = [Q({ id: 'b1', skillId: 'basic' })];
  const basicAttempts = [A({ questionId: 'b1', skillId: 'basic', correct: false })]; // only 1 attempt

  const evidenceById = new Map([
    ['basic', buildEvidence('basic', basicAttempts, new Map(basicQs.map((q) => [q.id, q])))],
    ['advanced', buildEvidence('advanced', [], new Map())],
  ]);

  assert.deepEqual(computeRootCause('advanced', [parent, basic], evidenceById), []);
});

test('bottleneck detection ranks skills by how many others depend on them', () => {
  const root: Skill = { id: 'root', domain: 'd', topic: 't', name: 'Root', prerequisiteIds: [] };
  const mid: Skill = { id: 'mid', domain: 'd', topic: 't', name: 'Mid', prerequisiteIds: ['root'] };
  const leaf: Skill = { id: 'leaf', domain: 'd', topic: 't', name: 'Leaf', prerequisiteIds: ['mid'] };
  const isolated: Skill = { id: 'isolated', domain: 'd', topic: 't', name: 'Isolated', prerequisiteIds: [] };

  const bottlenecks = computeBottlenecks([root, mid, leaf, isolated], new Map());
  assert.equal(bottlenecks[0].skillId, 'root');
  assert.equal(bottlenecks[0].dependentCount, 2);
  assert.ok(!bottlenecks.some((b) => b.skillId === 'isolated'));
});

test('mastery check blueprint never asks for more questions than the bank contains', () => {
  const questions = ['q1', 'q2'].map((id) => Q({ id, skillId: 'skill_a' }));
  const blueprint = generateBlueprint('skill_a', [SKILL], questions);
  assert.ok(blueprint.questionCount <= questions.length);

  const selected = selectQuestions(blueprint, questions, new Set());
  assert.equal(selected.length, blueprint.questionCount);
});

test('mastery check selection prioritises novel/varied questions over already-seen ones', () => {
  const questions = [
    Q({ id: 'seen1', skillId: 'skill_a', novelty: 'seen' }),
    Q({ id: 'seen2', skillId: 'skill_a', novelty: 'seen' }),
    Q({ id: 'novel1', skillId: 'skill_a', novelty: 'novel' }),
  ];
  const blueprint = generateBlueprint('skill_a', [SKILL], questions);
  const selected = selectQuestions(blueprint, questions, new Set());
  assert.ok(selected.some((q) => q.id === 'novel1'));
});
