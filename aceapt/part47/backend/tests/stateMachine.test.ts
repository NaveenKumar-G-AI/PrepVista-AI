import { describe, it, expect } from 'vitest';
import { canTransitionSession, assertSessionTransition, assertSequentialAdvance, InvalidTransitionError } from '../src/domain/engine/stateMachine.js';

describe('session state machine (Section 8, 72)', () => {
  it('allows STARTED -> ACTIVE', () => {
    expect(canTransitionSession('STARTED', 'ACTIVE')).toBe(true);
  });
  it('allows ACTIVE -> PAUSED -> ACTIVE (pause/resume)', () => {
    expect(canTransitionSession('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionSession('PAUSED', 'ACTIVE')).toBe(true);
  });
  it('rejects a transition out of a terminal COMPLETED state', () => {
    expect(canTransitionSession('COMPLETED', 'ACTIVE')).toBe(false);
    expect(() => assertSessionTransition('COMPLETED', 'ACTIVE')).toThrow(InvalidTransitionError);
  });
  it('allows an idempotent no-op transition (safe retries, Section 93)', () => {
    expect(canTransitionSession('ACTIVE', 'ACTIVE')).toBe(true);
  });
});

describe('assertSequentialAdvance (Section 72\'s concrete example)', () => {
  it('allows advancing by exactly one step', () => {
    expect(() => assertSequentialAdvance(0, 1, 5)).not.toThrow();
  });
  it('rejects jumping from step 1 pending straight to step 5 complete', () => {
    expect(() => assertSequentialAdvance(0, 4, 5)).toThrow(InvalidTransitionError);
  });
  it('allows staying on the same index (a failed attempt that does not advance)', () => {
    expect(() => assertSequentialAdvance(2, 2, 5)).not.toThrow();
  });
});
