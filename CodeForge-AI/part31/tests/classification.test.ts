import { describe, expect, it } from 'vitest';
import { classifyReadiness } from '../src/domain/classification';

describe('classifyReadiness', () => {
  it('caps state at DEVELOPING when the core gate fails, even with a high score and high confidence', () => {
    // This is Phase 12's own example made concrete: a near-perfect weighted
    // score and high confidence must NOT translate to READY if a core
    // skill failed its gate — averages cannot hide a core deficiency.
    const state = classifyReadiness({ coreGatePassed: false, weightedScore: 95, coverage: 0.9, confidence: 'high' });
    expect(state).toBe('DEVELOPING');
    expect(state).not.toBe('READY');
    expect(state).not.toBe('STRONGLY_READY');
  });

  it('returns NOT_ASSESSED when coverage is near zero, regardless of gate state', () => {
    expect(classifyReadiness({ coreGatePassed: false, weightedScore: 0, coverage: 0, confidence: 'low' })).toBe(
      'NOT_ASSESSED',
    );
  });

  it('returns STRONGLY_READY only with a very high score AND high confidence', () => {
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 95, coverage: 0.9, confidence: 'high' })).toBe(
      'STRONGLY_READY',
    );
    // same score, lower confidence -> does not reach STRONGLY_READY
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 95, coverage: 0.9, confidence: 'medium' })).not.toBe(
      'STRONGLY_READY',
    );
  });

  it('returns READY for a solid score with at least medium confidence once the gate passes', () => {
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 80, coverage: 0.9, confidence: 'medium' })).toBe(
      'READY',
    );
  });

  it('does not return READY when confidence is low, even with a high score', () => {
    const state = classifyReadiness({ coreGatePassed: true, weightedScore: 85, coverage: 0.9, confidence: 'low' });
    expect(state).not.toBe('READY');
    expect(state).not.toBe('STRONGLY_READY');
  });

  it('moves through the intermediate states as score increases with the gate passed', () => {
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 20, coverage: 0.9, confidence: 'medium' })).toBe(
      'EARLY_STAGE',
    );
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 40, coverage: 0.9, confidence: 'medium' })).toBe(
      'DEVELOPING',
    );
    expect(classifyReadiness({ coreGatePassed: true, weightedScore: 60, coverage: 0.9, confidence: 'medium' })).toBe(
      'APPROACHING_READY',
    );
  });
});
