import { describe, it, expect } from 'vitest';
import { determineFailureSignatures } from '../domain/failureSignature.js';
import type { VerificationFactor } from '../domain/types.js';

function factor(name: string, meetsRequirement: boolean): VerificationFactor {
  return { name, score: meetsRequirement ? 0.9 : 0.3, weight: 0.2, threshold: 0.7, meetsRequirement, explanation: `${name} explanation` };
}

const allPass: VerificationFactor[] = [
  factor('Target Capability', true), factor('Novel Performance', true), factor('Timed Performance', true),
  factor('Consistency', true), factor('Critical Risk', true),
];

describe('determineFailureSignatures', () => {
  it('maps a failing Target Capability factor to KNOWLEDGE_GAP', () => {
    const factors = allPass.map((f) => (f.name === 'Target Capability' ? factor(f.name, false) : f));
    const signatures = determineFailureSignatures({ factors, evidence: [] });
    expect(signatures.map((s) => s.type)).toContain('KNOWLEDGE_GAP');
  });

  it('adds both NOVELTY_HANDLING and TRANSFER_GAP when practice is strong but novel performance is not', () => {
    const factors = allPass.map((f) => (f.name === 'Novel Performance' ? factor(f.name, false) : f));
    const signatures = determineFailureSignatures({ factors, evidence: [] });
    expect(signatures.map((s) => s.type)).toEqual(expect.arrayContaining(['NOVELTY_HANDLING', 'TRANSFER_GAP']));
  });

  it('does not add TRANSFER_GAP when both practice and novel performance are weak', () => {
    const factors = allPass.map((f) => (f.name === 'Target Capability' || f.name === 'Novel Performance' ? factor(f.name, false) : f));
    const signatures = determineFailureSignatures({ factors, evidence: [] });
    expect(signatures.map((s) => s.type)).not.toContain('TRANSFER_GAP');
  });

  it('maps Timed Performance and Consistency failures to SPEED_GAP and CONSISTENCY', () => {
    const factors = allPass.map((f) => (f.name === 'Timed Performance' || f.name === 'Consistency' ? factor(f.name, false) : f));
    const signatures = determineFailureSignatures({ factors, evidence: [] });
    expect(signatures.map((s) => s.type)).toEqual(expect.arrayContaining(['SPEED_GAP', 'CONSISTENCY']));
  });

  it('adds LATE_TEST_DEGRADATION and TIME_MANAGEMENT from session-level signals, independent of factor scores', () => {
    const signatures = determineFailureSignatures({
      factors: allPass,
      evidence: [],
      lateTestDegradation: true,
      recovery: {
        afterDifficultQuestionAccuracy: 0.2, baselineAccuracy: 0.8,
        longStallFollowedByInaccuracy: true, maintainsPerformanceAfterDifficulty: false,
      },
    });
    expect(signatures.map((s) => s.type)).toEqual(expect.arrayContaining(['LATE_TEST_DEGRADATION', 'TIME_MANAGEMENT']));
  });

  it('produces no signatures when every factor passes and there are no session-level flags', () => {
    const signatures = determineFailureSignatures({ factors: allPass, evidence: [] });
    expect(signatures).toHaveLength(0);
  });
});
