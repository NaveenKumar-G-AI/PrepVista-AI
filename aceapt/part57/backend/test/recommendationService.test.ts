import { describe, it, expect } from 'vitest';
import { buildRecommendation } from '../src/services/recommendationService';

const trustedFastCandidate = {
  shortcutId: 's1',
  canonicalName: 'Quarter Method',
  applicability: 'APPLICABLE' as const,
  trustState: 'TRUSTED' as const,
  reliability: 0.95,
  avgTimeSavedRatio: 0.4,
};

describe('buildRecommendation', () => {
  it('gives no strategy assistance in formal assessment by default (secs. 95, 234)', () => {
    const outcome = buildRecommendation({
      mode: 'FORMAL_ASSESSMENT',
      assessmentAllowsStrategyAssistance: false,
      candidates: [trustedFastCandidate],
    });
    expect(outcome.allowed).toBe(false);
    expect(outcome.recommended).toBeNull();
  });

  it('allows recommendations in formal assessment only when explicitly permitted', () => {
    const outcome = buildRecommendation({
      mode: 'FORMAL_ASSESSMENT',
      assessmentAllowsStrategyAssistance: true,
      candidates: [trustedFastCandidate],
    });
    expect(outcome.allowed).toBe(true);
    expect(outcome.recommended?.shortcutId).toBe('s1');
  });

  it('recommends the trusted, applicable, time-saving method when standard method is worse (sec. 89)', () => {
    const outcome = buildRecommendation({
      mode: 'PRACTICE',
      assessmentAllowsStrategyAssistance: false,
      candidates: [trustedFastCandidate],
      standardMethodStats: { accuracy: 0.8, medianTimeMs: 18000 },
    });
    expect(outcome.recommended?.shortcutId).toBe('s1');
    expect(outcome.recommended?.rationale).not.toMatch(/always use/i);
  });

  it('does not recommend a shortcut just because it exists when the standard method is at least as good (secs. 191-192, 277)', () => {
    const noBenefitCandidate = { ...trustedFastCandidate, avgTimeSavedRatio: 0, reliability: 0.75 };
    const outcome = buildRecommendation({
      mode: 'PRACTICE',
      assessmentAllowsStrategyAssistance: false,
      candidates: [noBenefitCandidate],
      standardMethodStats: { accuracy: 0.9, medianTimeMs: 15000 },
    });
    expect(outcome.recommended).toBeNull();
    expect(outcome.reason).toMatch(/standard method/i);
  });

  it('ignores candidates that are not applicable or not yet trusted/reliable', () => {
    const notApplicable = { ...trustedFastCandidate, applicability: 'NOT_APPLICABLE' as const };
    const stillDeveloping = { ...trustedFastCandidate, shortcutId: 's2', trustState: 'DEVELOPING' as const };
    const outcome = buildRecommendation({
      mode: 'PRACTICE',
      assessmentAllowsStrategyAssistance: false,
      candidates: [notApplicable, stillDeveloping],
    });
    expect(outcome.recommended).toBeNull();
  });

  it('prefers TRUSTED over RELIABLE, then higher reliability, then more time saved', () => {
    const reliableOnly = { ...trustedFastCandidate, shortcutId: 's2', trustState: 'RELIABLE' as const, reliability: 0.99 };
    const outcome = buildRecommendation({
      mode: 'PRACTICE',
      assessmentAllowsStrategyAssistance: false,
      candidates: [reliableOnly, trustedFastCandidate],
    });
    expect(outcome.recommended?.shortcutId).toBe('s1'); // TRUSTED beats a higher-reliability RELIABLE candidate
  });
});
