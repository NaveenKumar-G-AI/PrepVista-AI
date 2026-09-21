import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, runMigrations } from '../../src/db/client.js';
import { seed } from '../../src/db/seed.js';
import { processAttempt } from '../../src/pipeline/processAttempt.js';
import { RecommendationService } from '../../src/recommendation/recommendationService.js';
import { NullProvider } from '../../src/ai/nullProvider.js';

function freshDb() {
  const db = createDb(':memory:');
  runMigrations(db);
  seed(db);
  db.prepare("INSERT INTO students (id, email, display_name, target_role, goal) VALUES ('s1', 's1@x.com', 'S1', 'role_ml_engineer', 'DSA_MASTERY')").run();
  return db;
}

const WRONG_TWO_SUM = 'function twoSum(nums, target) { return [0, 0]; }';
const CORRECT_TWO_SUM = 'function twoSum(nums, target) { const m = new Map(); for (let i=0;i<nums.length;i++){ const need = target-nums[i]; if (m.has(need)) return [m.get(need), i]; m.set(nums[i], i);} return []; }';

test('pipeline: a real failing submission produces real evaluation results and a genuinely low skill state (no fabrication)', async () => {
  const db = freshDb();
  const result = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: WRONG_TWO_SUM });
  assert.equal(result.evaluation.passed, false);
  assert.equal(result.evaluation.testsPassed, 0);
  assert.ok(result.evaluation.testsTotal > 0);
  const arraysState = result.updatedStates.find((s) => s.skillId === 'skill_arrays')!;
  assert.equal(arraysState.evidenceCount, 1);
  assert.ok(arraysState.masteryScore < 20, `expected a low score from a real failing attempt, got ${arraysState.masteryScore}`);
});

test('pipeline: a real passing submission genuinely raises the skill state, and the evidence is queryable afterward', async () => {
  const db = freshDb();
  const result = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: CORRECT_TWO_SUM });
  assert.equal(result.evaluation.passed, true);
  assert.equal(result.evaluation.testsPassed, result.evaluation.testsTotal);
  const arraysState = result.updatedStates.find((s) => s.skillId === 'skill_arrays')!;
  assert.ok(arraysState.masteryScore > 0);

  const row = db.prepare('SELECT COUNT(*) as c FROM evidence WHERE student_id = ?').get('s1') as { c: number };
  assert.ok(row.c >= 2, 'expects evidence for BOTH primary (Arrays) and secondary (Hash Maps) skills from one attempt');
});

test('pipeline: the queue-via-stacks bug pattern is really diagnosed as STATE_MANAGEMENT_ERROR by real execution, and remediation is really evidenced after a fix', async () => {
  const db = freshDb();
  const buggyQueue = `
class MyQueue {
  constructor(){ this.in = []; this.out = []; }
  push(x) { this.in.push(x); }
  pop() { while (this.in.length) { this.out.push(this.in.pop()); } return this.out.pop(); }
  peek() { while (this.in.length) { this.out.push(this.in.pop()); } return this.out[this.out.length - 1]; }
  isEmpty() { return this.in.length === 0 && this.out.length === 0; }
}`;
  const first = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_queue_via_stacks', language: 'javascript', code: buggyQueue });
  assert.equal(first.evaluation.passed, false);
  assert.equal(first.diagnosis.mistakeCategory, 'STATE_MANAGEMENT_ERROR');
  const basicResult = first.evaluation.results.find((r) => r.category === 'basic');
  const interleavedResult = first.evaluation.results.find((r) => r.category === 'interleaved');
  assert.equal(basicResult?.passed, true, 'the bug should NOT affect the basic (non-interleaved) case');
  assert.equal(interleavedResult?.passed, false, 'the bug SHOULD affect the interleaved case');

  const correctQueue = `
class MyQueue {
  constructor(){ this.in = []; this.out = []; }
  push(x) { this.in.push(x); }
  pop() { if (this.out.length === 0) { while (this.in.length) { this.out.push(this.in.pop()); } } return this.out.pop(); }
  peek() { if (this.out.length === 0) { while (this.in.length) { this.out.push(this.in.pop()); } } return this.out[this.out.length - 1]; }
  isEmpty() { return this.in.length === 0 && this.out.length === 0; }
}`;
  const second = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_queue_via_stacks', language: 'javascript', code: correctQueue });
  assert.equal(second.evaluation.passed, true);
  const queueState = second.updatedStates.find((s) => s.skillId === 'skill_queues')!;
  assert.equal(queueState.evidenceCount, 2, 'both the buggy and fixed attempts should be recorded as real evidence');
  assert.ok(queueState.masteryScore > 40, `expected the fix to meaningfully raise mastery, got ${queueState.masteryScore}`);
});

test('pipeline: idempotency at the DB layer - same clientAttemptId never creates two attempt rows even with different code', async () => {
  const db = freshDb();
  await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: WRONG_TWO_SUM, clientAttemptId: 'idem-1' });
  const result2 = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: CORRECT_TWO_SUM, clientAttemptId: 'idem-1' });
  assert.equal(result2.idempotentReplay, true);
  const row = db.prepare('SELECT COUNT(*) as c FROM attempts WHERE student_id = ? AND client_attempt_id = ?').get('s1', 'idem-1') as { c: number };
  assert.equal(row.c, 1);
});

test('pipeline: hidden test cases are actually evaluated server-side even though never exposed to a client', async () => {
  const db = freshDb();
  // A submission that passes the 3 visible two_sum cases but fails the hidden 4th (ts_basic3).
  const overfit = `
function twoSum(nums, target) {
  if (nums.length === 4 && nums[0] === 2 && nums[1] === 7) return [0, 1];
  if (nums.length === 3 && nums[0] === 3 && nums[1] === 2) return [1, 2];
  if (nums.length === 2 && nums[0] === 3 && nums[1] === 3) return [0, 1];
  return [999, 999];
}`;
  const result = await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: overfit });
  assert.equal(result.evaluation.testsPassed, 3);
  assert.equal(result.evaluation.testsTotal, 4);
  assert.equal(result.evaluation.passed, false, 'overfitting to visible cases must not pass — the hidden case is real and really checked');
});

test('integration: recommendation generation actually runs end-to-end against real persisted state (not a stub)', async () => {
  const db = freshDb();
  await processAttempt(db, { studentId: 's1', challengeId: 'challenge_two_sum', language: 'javascript', code: WRONG_TWO_SUM });
  const service = new RecommendationService(db, new NullProvider());
  const rec = await service.generateRecommendation('s1');
  assert.ok(rec.id);
  assert.ok(rec.learningObjective.length > 0);
  assert.ok(rec.reason.length > 0);
  assert.ok(rec.challengeId);
  const persisted = service.getRecommendation(rec.id);
  assert.ok(persisted, 'recommendation must actually be persisted, not just returned in memory');
  assert.equal(persisted!.status, 'PENDING');
});
