import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, transition, InvalidTransitionError, DEFAULT_TRANSITIONS, parseTransitionGraph } from './interviewStateMachine';
import { InterviewState } from '../types/domain';

test('happy path: full linear flow succeeds end to end', () => {
  const path: InterviewState[] = [
    'CREATED', 'READY', 'STARTED', 'PROBLEM_PRESENTED', 'CLARIFICATION',
    'APPROACH_DISCUSSION', 'CODING', 'TESTING', 'FOLLOW_UP', 'FINAL_EVALUATION', 'COMPLETED',
  ];
  let current = path[0];
  for (const next of path.slice(1)) {
    current = transition(current, next);
  }
  assert.equal(current, 'COMPLETED');
});

test('debugging loops back into testing', () => {
  assert.equal(transition('TESTING', 'DEBUGGING'), 'DEBUGGING');
  assert.equal(transition('DEBUGGING', 'TESTING'), 'TESTING');
});

test('cannot skip states', () => {
  assert.throws(() => transition('CREATED', 'CODING'), InvalidTransitionError);
});

test('terminal states reject every further transition', () => {
  for (const terminalState of ['COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED'] as const) {
    assert.equal(canTransition(terminalState, 'CODING'), false);
  }
});

test('blueprint-level override graph is respected when valid', () => {
  const strictGraph = { ...DEFAULT_TRANSITIONS, TESTING: ['FOLLOW_UP'] as InterviewState[] };
  assert.equal(canTransition('TESTING', 'DEBUGGING', strictGraph), false);
  assert.equal(canTransition('TESTING', 'FOLLOW_UP', strictGraph), true);
});

test('a malformed override graph falls back to the safe default rather than opening up transitions', () => {
  const malformed = { TESTING: ['NOT_A_REAL_STATE'] };
  const graph = parseTransitionGraph(malformed);
  assert.deepEqual(graph, DEFAULT_TRANSITIONS);
});
