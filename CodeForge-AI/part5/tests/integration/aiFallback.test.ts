import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroqProvider } from '../../src/ai/groqProvider.js';
import { GeminiProvider } from '../../src/ai/geminiProvider.js';
import { NullProvider } from '../../src/ai/nullProvider.js';
import { polishObjectiveWithAI } from '../../src/recommendation/objectiveExplanation.js';
import { createDb, runMigrations } from '../../src/db/client.js';
import { seed } from '../../src/db/seed.js';
import { processAttempt } from '../../src/pipeline/processAttempt.js';
import { RecommendationService } from '../../src/recommendation/recommendationService.js';

test('AI fallback: NullProvider (no AI_PROVIDER configured) returns null for every method, by design', async () => {
  const provider = new NullProvider();
  assert.equal(await provider.generateLearningObjective({ deterministicObjective: 'x' }), null);
  assert.equal(await provider.interpretAmbiguousEvidence({ skillName: 'x', contradictionExplanation: 'x', recentScores: [] }), null);
  assert.equal(await provider.explainFeedback({ skillName: 'x', mistakeCategory: 'x', deterministicExplanation: 'x' }), null);
});

test('AI fallback: GroqProvider with no API key configured returns null immediately without attempting a network call', async () => {
  const original = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const provider = new GroqProvider();
    const result = await provider.generateLearningObjective({ deterministicObjective: 'Improve X' });
    assert.equal(result, null);
  } finally {
    if (original) process.env.GROQ_API_KEY = original;
  }
});

test('AI fallback: GroqProvider with a key set but genuinely UNREACHABLE from this sandbox (api.groq.com is outside the network allowlist) really fails closed to null, not an exception', async () => {
  const original = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key-that-will-never-reach-the-network';
  try {
    const provider = new GroqProvider();
    // This is a REAL fetch() attempt to https://api.groq.com — not mocked. In this sandbox that
    // domain is genuinely outside the egress allowlist, so this exercises the actual
    // network-failure -> null fallback path for real, not a simulated one.
    const start = Date.now();
    const result = await provider.generateLearningObjective({ deterministicObjective: 'Improve boundary-condition handling in binary search.' });
    const elapsed = Date.now() - start;
    assert.equal(result, null, 'a genuinely unreachable AI provider must resolve to null, never throw');
    assert.ok(elapsed < 10000, `should fail fast via the configured timeout, not hang; took ${elapsed}ms`);
  } finally {
    if (original) process.env.GROQ_API_KEY = original; else delete process.env.GROQ_API_KEY;
  }
});

test('AI fallback: GeminiProvider with no key configured also fails closed to null', async () => {
  const provider = new GeminiProvider();
  const result = await provider.interpretAmbiguousEvidence({ skillName: 'Arrays', contradictionExplanation: 'x', recentScores: [0.2, 0.9] });
  assert.equal(result, null);
});

test('AI fallback: polishObjectiveWithAI returns the deterministic text verbatim, with aiUsed=false, when the provider is unavailable', async () => {
  const { text, aiUsed } = await polishObjectiveWithAI('Improve boundary-condition handling in binary search.', new NullProvider());
  assert.equal(text, 'Improve boundary-condition handling in binary search.');
  assert.equal(aiUsed, false);
});

test('AI fallback: the FULL recommendation pipeline works end-to-end with zero AI availability (Phase 41: engine keeps functioning)', async () => {
  const db = createDb(':memory:');
  runMigrations(db);
  seed(db);
  db.prepare("INSERT INTO students (id, email, display_name, goal) VALUES ('s1', 's1@x.com', 'S1', 'DSA_MASTERY')").run();
  await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: 'function twoSum(nums, target) { return [0,0]; }' });

  const service = new RecommendationService(db, new NullProvider());
  const rec = await service.generateRecommendation('s1');
  assert.ok(rec.learningObjective.length > 0, 'a real learning objective must exist even with zero AI');
  assert.ok(rec.reason.length > 0, 'a real explanation must exist even with zero AI');
  const snapshot = rec.evidenceSnapshot as { aiPolishUsed?: boolean };
  assert.equal(snapshot.aiPolishUsed, false, 'the snapshot should honestly record that AI was not used for this recommendation');
});
