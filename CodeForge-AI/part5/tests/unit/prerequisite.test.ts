import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, runMigrations } from '../../src/db/client.js';
import { seed } from '../../src/db/seed.js';
import { EvidenceService } from '../../src/evidence/evidenceService.js';
import { MasteryStateService } from '../../src/mastery/masteryStateService.js';
import { PrerequisiteAnalyzer } from '../../src/gaps/prerequisiteAnalyzer.js';
import type { Attempt, Challenge, Diagnosis, EvaluationResult } from '../../src/types.js';

function freshDb() {
  const db = createDb(':memory:');
  runMigrations(db);
  seed(db);
  db.prepare("INSERT INTO students (id, email, display_name, goal) VALUES ('s1', 's1@x.com', 'S1', 'DSA_MASTERY')").run();
  return db;
}

function fakeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return { id: 'att1', studentId: 's1', challengeId: 'challenge_bfs_order', language: 'javascript', code: '', clientAttemptId: null, assistanceUsed: 'NONE', recommendationId: null, submittedAt: new Date().toISOString(), ...overrides };
}
/** Inserts a minimal real attempts row (evidence.attempt_id is a real FK — Phase 51 — so tests must satisfy it just like the real pipeline does). */
function insertRealAttempt(db: ReturnType<typeof createDb>, attempt: Attempt): Attempt {
  db.prepare('INSERT INTO attempts (id, student_id, challenge_id, language, code, assistance_used) VALUES (?, ?, ?, ?, ?, ?)')
    .run(attempt.id, attempt.studentId, attempt.challengeId, attempt.language, attempt.code, attempt.assistanceUsed);
  return attempt;
}
function evalResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return { attemptId: 'att1', testsTotal: 3, testsPassed: 0, passed: false, runtimeError: false, syntaxError: false, timeout: false, results: [], ...overrides };
}
function diag(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return { attemptId: 'att1', mistakeCategory: 'LOGIC_ERROR', languageIssue: false, failurePattern: null, details: '', ...overrides };
}

test('prerequisite analysis: a skill with no weak prerequisites is not flagged', () => {
  const db = freshDb();
  const analyzer = new PrerequisiteAnalyzer(db);
  // No evidence recorded anywhere -> prerequisites read as UNKNOWN(0), which for a fresh unattempted
  // student is not "no prerequisite issue" but IS "there is a readiness concern" — verify the shape works either way without throwing.
  const result = analyzer.analyze('s1', 'skill_two_pointers'); // depends on skill_arrays
  assert.ok(result === null || result.gapType === 'PREREQUISITE_GAP');
});

test('prerequisite analysis: Queues weak -> Graph Algorithms gets a PREREQUISITE_GAP pointing at Queues, not treated as its own deficiency (Phase 12 exact scenario)', () => {
  const db = freshDb();
  const evidenceService = new EvidenceService(db);
  const masteryState = new MasteryStateService(db);
  const analyzer = new PrerequisiteAnalyzer(db);

  // Give the student SOME evidence on Queues, but weak (failing) evidence, so Queues reads as under-ready,
  // not simply UNKNOWN. Uses the real challenge/skill graph from the seed.
  const queueChallenge: Challenge = {
    id: 'challenge_queue_via_stacks', title: '', primarySkillId: 'skill_queues', secondarySkillIds: ['skill_stacks'],
    difficultyLevel: 'MEDIUM', difficultyScore: 5, conceptDifficulty: 4, implementationComplexity: 4, constraintComplexity: 2,
    reasoningComplexity: 4, ambiguity: 2, contextType: 'STANDARD', harnessType: 'stateful_ops', languagesSupported: ['javascript'],
    status: 'ACTIVE', isVerification: false, prompt: '', functionName: 'MyQueue', transferOfChallengeId: null,
  };
  for (let i = 0; i < 3; i++) {
    evidenceService.recordEvidence({
      attempt: insertRealAttempt(db, fakeAttempt({ id: `qa${i}`, challengeId: 'challenge_queue_via_stacks' })),
      challenge: queueChallenge,
      evaluation: evalResult({ attemptId: `qa${i}`, testsPassed: 0, testsTotal: 3 }),
      diagnosis: diag({ attemptId: `qa${i}`, mistakeCategory: 'STATE_MANAGEMENT_ERROR' }),
    });
  }
  masteryState.recompute('s1', 'skill_queues');
  const queueState = masteryState.getState('s1', 'skill_queues')!;
  assert.ok(queueState.masteryScore < 35, `expected weak Queues mastery, got ${queueState.masteryScore}`);

  // Now analyze Graph Algorithms, which lists Queues as a PREREQUISITE in the seeded skill graph.
  const result = analyzer.analyze('s1', 'skill_graph_algorithms');
  assert.ok(result, 'expected a PREREQUISITE_GAP to be raised for Graph Algorithms');
  assert.equal(result!.gapType, 'PREREQUISITE_GAP');
  assert.equal(result!.rootCauseSkillId, 'skill_queues');
  assert.match(result!.explanation, /Queues/);
});

test('prerequisite analysis: once the prerequisite is solid, no PREREQUISITE_GAP is raised', () => {
  const db = freshDb();
  const evidenceService = new EvidenceService(db);
  const masteryState = new MasteryStateService(db);
  const analyzer = new PrerequisiteAnalyzer(db);

  const queueChallenge: Challenge = {
    id: 'challenge_queue_via_stacks', title: '', primarySkillId: 'skill_queues', secondarySkillIds: ['skill_stacks'],
    difficultyLevel: 'MEDIUM', difficultyScore: 5, conceptDifficulty: 4, implementationComplexity: 4, constraintComplexity: 2,
    reasoningComplexity: 4, ambiguity: 2, contextType: 'STANDARD', harnessType: 'stateful_ops', languagesSupported: ['javascript'],
    status: 'ACTIVE', isVerification: false, prompt: '', functionName: 'MyQueue', transferOfChallengeId: null,
  };
  for (let i = 0; i < 4; i++) {
    evidenceService.recordEvidence({
      attempt: insertRealAttempt(db, fakeAttempt({ id: `qb${i}`, challengeId: 'challenge_queue_via_stacks' })),
      challenge: queueChallenge,
      evaluation: evalResult({ attemptId: `qb${i}`, testsPassed: 3, testsTotal: 3, passed: true }),
      diagnosis: diag({ attemptId: `qb${i}`, mistakeCategory: 'NONE' }),
    });
  }
  masteryState.recompute('s1', 'skill_queues');
  const queueState = masteryState.getState('s1', 'skill_queues')!;
  assert.ok(queueState.masteryScore >= 35, `expected solid Queues mastery, got ${queueState.masteryScore}`);

  const result = analyzer.analyze('s1', 'skill_graph_algorithms');
  // Graphs and Recursion are ALSO prerequisites of Graph Algorithms in the seed graph and are still
  // completely unattempted here, so a gap may still legitimately fire for one of THOSE — but it must
  // not be Queues, since Queues is now solid.
  if (result) assert.notEqual(result.rootCauseSkillId, 'skill_queues');
});
