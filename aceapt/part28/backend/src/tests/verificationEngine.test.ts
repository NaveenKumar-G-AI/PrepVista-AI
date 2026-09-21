import { describe, it, expect } from 'vitest';
import { evaluateVerification } from '../domain/verificationEngine.js';
import { DEFAULT_VERIFICATION_CONFIG } from '../domain/config.js';
import type { VerificationEvidence, VerificationRequirement } from '../domain/types.js';

function makeEvidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    id: `ev_${Math.random()}`,
    studentId: 'student_1',
    sessionId: null,
    sourceAttemptId: null,
    evidenceType: 'PRACTICE',
    capability: 'arrays',
    difficulty: 'MEDIUM',
    novelty: 'RELATED',
    performance: 0.8,
    timeTakenMs: 50_000,
    expectedTimeMs: 60_000,
    isValid: true,
    quality: {
      recency: 0.9, diversity: 0.7, difficulty: 0.6, novelty: 0.5, independence: 1,
      timePressure: 0.8, targetRelevance: 0.6, repeatedPerformance: 0.8,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const requirement: VerificationRequirement = {
  id: 'req_1', targetId: 'target_1', capability: 'arrays', minPerformance: 0.8, minNovelty: 'NOVEL',
  minConsistency: 0.7, minTimedPerformance: 0.7, minConfidenceEvidence: 4, weight: 1, isActive: true,
  createdAt: new Date().toISOString(),
};

describe('evaluateVerification', () => {
  it('returns NOT_VERIFIED when evidence is below the configured minimum count, regardless of scores', () => {
    const evidence = [makeEvidence({ performance: 1 }), makeEvidence({ performance: 1 })];
    const result = evaluateVerification({ evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    expect(result.status).toBe('NOT_VERIFIED');
    expect(result.insufficientEvidence).toBe(true);
  });

  it('does not reach VERIFIED when one factor fails even though the composite score is otherwise high (AND-gate)', () => {
    const evidence = Array.from({ length: 8 }).map((_, i) => makeEvidence({
      id: `ev_${i}`,
      performance: 0.95,
      novelty: 'NOVEL',
      timeTakenMs: null,
      expectedTimeMs: null,
      quality: {
        recency: 0.95, diversity: 0.9, difficulty: 0.8, novelty: 0.75, independence: 0.9,
        timePressure: 0.3, targetRelevance: 0.9, repeatedPerformance: 0.95,
      },
    }));
    const result = evaluateVerification({ evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    const timed = result.factors.find((f) => f.name === 'Timed Performance')!;
    expect(timed.meetsRequirement).toBe(false);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.status).not.toBe('STRONGLY_VERIFIED');
    expect(result.status).toBe('CONDITIONALLY_VERIFIED');
  });

  it('reaches VERIFIED or STRONGLY_VERIFIED when every factor clears its threshold', () => {
    const evidence = Array.from({ length: 10 }).map((_, i) => makeEvidence({
      id: `ev_${i}`,
      performance: 0.9,
      novelty: i % 2 === 0 ? 'NOVEL' : 'HIGHLY_NOVEL',
      difficulty: 'HARD',
      timeTakenMs: 55_000,
      expectedTimeMs: 60_000,
      quality: {
        recency: 0.9, diversity: 0.9, difficulty: 0.85, novelty: 0.8, independence: 0.7,
        timePressure: 0.9, targetRelevance: 0.85, repeatedPerformance: 0.9,
      },
    }));
    const result = evaluateVerification({ evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    expect(result.factors.every((f) => f.meetsRequirement)).toBe(true);
    expect(['VERIFIED', 'STRONGLY_VERIFIED']).toContain(result.status);
  });

  it('penalizes inconsistent performance relative to stable performance in the Consistency factor', () => {
    const volatile = [0.95, 0.3, 0.9, 0.25, 0.85, 0.2].map((performance, i) => makeEvidence({ id: `ev_${i}`, performance }));
    const stable = [0.85, 0.82, 0.88, 0.84, 0.86, 0.83].map((performance, i) => makeEvidence({ id: `ev2_${i}`, performance }));
    const volatileResult = evaluateVerification({ evidence: volatile, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    const stableResult = evaluateVerification({ evidence: stable, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    const volatileConsistency = volatileResult.factors.find((f) => f.name === 'Consistency')!.score;
    const stableConsistency = stableResult.factors.find((f) => f.name === 'Consistency')!.score;
    expect(stableConsistency).toBeGreaterThan(volatileConsistency);
  });

  it('gates VERIFIED behind Critical Risk when the most recent simulation showed late-test degradation', () => {
    const strongEvidence = Array.from({ length: 10 }).map((_, i) => makeEvidence({
      id: `ev_${i}`, performance: 0.92, novelty: 'HIGHLY_NOVEL', timeTakenMs: 55_000, expectedTimeMs: 60_000,
      quality: {
        recency: 0.9, diversity: 0.9, difficulty: 0.85, novelty: 0.9, independence: 0.7,
        timePressure: 0.9, targetRelevance: 0.85, repeatedPerformance: 0.92,
      },
    }));
    const withoutRisk = evaluateVerification({ evidence: strongEvidence, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    const withRisk = evaluateVerification({
      evidence: strongEvidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      sessionSignals: { lateTestDegradation: true, recoveryConcern: false, abandoned: false },
    });
    expect(['VERIFIED', 'STRONGLY_VERIFIED']).toContain(withoutRisk.status);
    expect(withRisk.factors.find((f) => f.name === 'Critical Risk')!.meetsRequirement).toBe(false);
    expect(withRisk.status).not.toBe('VERIFIED');
    expect(withRisk.status).not.toBe('STRONGLY_VERIFIED');
  });

  it('reports higher confidence as quality-weighted evidence volume grows', () => {
    const few = Array.from({ length: 3 }).map((_, i) => makeEvidence({ id: `ev_${i}` }));
    const many = Array.from({ length: 15 }).map((_, i) => makeEvidence({
      id: `ev_${i}`,
      quality: {
        recency: 0.9, diversity: 0.9, difficulty: 0.8, novelty: 0.8, independence: 0.9, timePressure: 0.8,
        targetRelevance: 0.8, repeatedPerformance: 0.8,
      },
    }));
    const fewResult = evaluateVerification({ evidence: few, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    const manyResult = evaluateVerification({ evidence: many, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    expect(manyResult.confidence).toBe('HIGH');
    expect(['LOW', 'MEDIUM']).toContain(fewResult.confidence);
  });

  it('ignores evidence for a different capability entirely', () => {
    const evidence = [makeEvidence({ capability: 'graphs', performance: 1 }), makeEvidence({ capability: 'graphs', performance: 1 }), makeEvidence({ capability: 'graphs', performance: 1 })];
    const result = evaluateVerification({ evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG });
    expect(result.insufficientEvidence).toBe(true);
    expect(result.evidenceSummary.totalCount).toBe(0);
  });
});
