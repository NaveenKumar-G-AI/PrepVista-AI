import { describe, it, expect } from 'vitest';
import { computeTrustState, TRUST_THRESHOLDS } from '../src/services/trust';

describe('computeTrustState', () => {
  it('never trusts after a single success (sec. 21, "Save != Trust"; sec. 190)', () => {
    const outcome = computeTrustState({
      usageCount: 1,
      successCount: 1,
      accuracy: 1,
      avgTimeSavedRatio: 0.5,
      recentWindowAccuracy: null,
      previousState: 'EXPERIMENTAL',
    });
    expect(outcome.state).not.toBe('TRUSTED');
    expect(outcome.state).toBe('DEVELOPING');
  });

  it('reaches RELIABLE once the sample-size and accuracy bars clear, before TRUSTED', () => {
    const outcome = computeTrustState({
      usageCount: TRUST_THRESHOLDS.MIN_USES_FOR_RELIABLE,
      successCount: TRUST_THRESHOLDS.MIN_USES_FOR_RELIABLE,
      accuracy: 1,
      avgTimeSavedRatio: 0, // no time benefit yet
      recentWindowAccuracy: 1,
      previousState: 'DEVELOPING',
    });
    expect(outcome.state).toBe('RELIABLE');
  });

  it('only reaches TRUSTED with enough uses, high accuracy, AND a real time-saving (sec. 36, 54, 248-249)', () => {
    const notEnoughTimeSaved = computeTrustState({
      usageCount: TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED,
      successCount: TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED,
      accuracy: 1,
      avgTimeSavedRatio: 0, // fast is not enough on its own (sec. 36, "do not optimize speed alone" - inverted: no speed benefit blocks trust too)
      recentWindowAccuracy: 1,
      previousState: 'RELIABLE',
    });
    expect(notEnoughTimeSaved.state).toBe('RELIABLE');

    const trusted = computeTrustState({
      usageCount: TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED,
      successCount: TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED,
      accuracy: 1,
      avgTimeSavedRatio: 0.3,
      recentWindowAccuracy: 1,
      previousState: 'RELIABLE',
    });
    expect(trusted.state).toBe('TRUSTED');
  });

  it('flags regression when a TRUSTED shortcut starts failing recently (sec. 56, 251)', () => {
    const outcome = computeTrustState({
      usageCount: 20,
      successCount: 14, // 70% lifetime accuracy - still looks OK in aggregate
      accuracy: 0.7,
      avgTimeSavedRatio: 0.3,
      recentWindowAccuracy: 0.2, // but the last few attempts have been bad
      previousState: 'TRUSTED',
    });
    expect(outcome.regressed).toBe(true);
    expect(outcome.state).toBe('NEEDS_REVIEW');
  });

  it('requires a clean recent window to climb back out of NEEDS_REVIEW - no silent auto-recovery', () => {
    const stillUnderReview = computeTrustState({
      usageCount: 22,
      successCount: 15,
      accuracy: 0.68,
      avgTimeSavedRatio: 0.3,
      recentWindowAccuracy: 0.5,
      previousState: 'NEEDS_REVIEW',
    });
    expect(stillUnderReview.state).toBe('NEEDS_REVIEW');

    const recovered = computeTrustState({
      usageCount: 25,
      successCount: 19,
      accuracy: 0.76,
      avgTimeSavedRatio: 0.3,
      recentWindowAccuracy: 0.9,
      previousState: 'NEEDS_REVIEW',
    });
    expect(recovered.state).toBe('RELIABLE');
  });
});
