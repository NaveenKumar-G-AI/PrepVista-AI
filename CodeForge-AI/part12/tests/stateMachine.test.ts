import { test, run, assert } from './testHarness.js';
import { SUBMISSION_STATUSES, type SubmissionStatus } from '../src/domain/enums.js';
import { canTransition, assertTransition, isTerminal, InvalidTransitionError, TRANSITIONS } from '../src/domain/stateMachine.js';

test('spec-named legal transitions all pass', () => {
  const legal: [SubmissionStatus, SubmissionStatus][] = [
    ['SUBMITTED', 'VALIDATING'],
    ['VALIDATING', 'QUEUED'],
    ['QUEUED', 'COMPILING'],
    ['COMPILING', 'RUNNING'],
    ['RUNNING', 'EVALUATING'],
    ['EVALUATING', 'COMPLETED'],
  ];
  for (const [from, to] of legal) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to} should be legal`);
    assert.doesNotThrow(() => assertTransition(from, to));
  }
});

test('infrastructure failure can reach JUDGE_ERROR from every in-flight state', () => {
  const inFlight: SubmissionStatus[] = ['QUEUED', 'COMPILING', 'RUNNING', 'EVALUATING'];
  for (const s of inFlight) {
    assert.equal(canTransition(s, 'JUDGE_ERROR'), true, `${s} -> JUDGE_ERROR should be legal`);
  }
});

test('spec-forbidden client-style jumps are all rejected', () => {
  const forbidden: [SubmissionStatus, SubmissionStatus][] = [
    ['SUBMITTED', 'COMPLETED'], // "student -> COMPLETED"
    ['QUEUED', 'EVALUATING'], // "student -> EVALUATING" (skips COMPILING/RUNNING)
    ['SUBMITTED', 'RUNNING'],
    ['QUEUED', 'COMPLETED'],
    ['COMPILING', 'EVALUATING'], // skips RUNNING
  ];
  for (const [from, to] of forbidden) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to} should be illegal`);
    assert.throws(() => assertTransition(from, to), InvalidTransitionError);
  }
});

test('terminal states have zero outgoing transitions', () => {
  const terminal: SubmissionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'JUDGE_ERROR'];
  for (const s of terminal) {
    assert.equal(isTerminal(s), true, `${s} should be terminal`);
    assert.deepEqual(TRANSITIONS[s], [], `${s} should have no outgoing transitions`);
    for (const target of SUBMISSION_STATUSES) {
      assert.equal(canTransition(s, target), false, `${s} -> ${target} should be illegal (terminal)`);
    }
  }
});

test('DRAFT has no outgoing transitions (never a persisted submission-row status)', () => {
  assert.deepEqual(TRANSITIONS.DRAFT, []);
});

test('no state can transition to itself (no accidental no-op loops)', () => {
  for (const s of SUBMISSION_STATUSES) {
    assert.equal(canTransition(s, s), false, `${s} -> ${s} should be illegal`);
  }
});

test('exhaustive: every (from,to) pair is classified, none silently undefined', () => {
  for (const from of SUBMISSION_STATUSES) {
    assert.ok(Array.isArray(TRANSITIONS[from]), `TRANSITIONS[${from}] must be an array`);
    for (const to of SUBMISSION_STATUSES) {
      // must not throw for any pair — canTransition is total over the enum
      const result = canTransition(from, to);
      assert.equal(typeof result, 'boolean');
    }
  }
});

test('InvalidTransitionError carries the offending from/to for logging/audit', () => {
  try {
    assertTransition('COMPLETED', 'QUEUED');
    assert.fail('should have thrown');
  } catch (err) {
    if (!(err instanceof InvalidTransitionError)) throw err;
    assert.equal(err.from, 'COMPLETED');
    assert.equal(err.to, 'QUEUED');
    assert.match(err.message, /COMPLETED -> QUEUED/);
  }
});

test('COMPILING -> COMPLETED is legal (models a COMPILATION_ERROR verdict, not a bug)', () => {
  assert.equal(canTransition('COMPILING', 'COMPLETED'), true);
});

await run('stateMachine.test.ts');
