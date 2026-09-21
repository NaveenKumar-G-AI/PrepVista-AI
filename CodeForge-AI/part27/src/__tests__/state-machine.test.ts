import { describe, it, expect } from 'vitest';
import { deriveBaseState, validateTransition } from '../skill-state/state-machine.js';

describe('deriveBaseState', () => {
  it('is UNKNOWN with no evidence', () => {
    expect(deriveBaseState(null, 0, 'LOW')).toBe('UNKNOWN');
  });

  it('a single near-perfect demonstration lands on PROFICIENT with LOW confidence, not MASTERED — section 13', () => {
    expect(deriveBaseState(0.98, 1, 'LOW')).toBe('PROFICIENT');
  });

  it('one difficult success does not skip straight to MASTERED — section 12', () => {
    expect(deriveBaseState(0.99, 1, 'LOW')).not.toBe('MASTERED');
  });

  it('reaches MASTERED only with enough evidence AND high confidence, all else equal', () => {
    expect(deriveBaseState(0.95, 8, 'HIGH')).toBe('MASTERED');
    expect(deriveBaseState(0.95, 8, 'LOW')).toBe('PROFICIENT');
  });
});

describe('validateTransition', () => {
  it('allows normal forward progression', () => {
    expect(validateTransition('DEVELOPING', 'PRACTICED').allowed).toBe(true);
    expect(validateTransition('PROFICIENT', 'MASTERED').allowed).toBe(true);
  });

  it('allows staying in the same state', () => {
    expect(validateTransition('PROFICIENT', 'PROFICIENT').allowed).toBe(true);
  });

  it('rejects MASTERED collapsing straight to INTRODUCED in one step — section 63', () => {
    const result = validateTransition('MASTERED', 'INTRODUCED');
    expect(result.allowed).toBe(false);
    expect(result.resolvedState).not.toBe('INTRODUCED');
  });

  it('rejects UNKNOWN jumping straight to MASTERED', () => {
    expect(validateTransition('UNKNOWN', 'MASTERED').allowed).toBe(false);
  });

  it('rejects UNKNOWN jumping straight to AT_RISK — nothing to be "at risk" of losing yet', () => {
    expect(validateTransition('UNKNOWN', 'AT_RISK').allowed).toBe(false);
  });

  it('allows MASTERED to REGRESSING directly — a real decline path', () => {
    expect(validateTransition('MASTERED', 'REGRESSING').allowed).toBe(true);
  });

  it('allows AT_RISK to recover back into the ladder', () => {
    expect(validateTransition('AT_RISK', 'PRACTICED').allowed).toBe(true);
  });
});
