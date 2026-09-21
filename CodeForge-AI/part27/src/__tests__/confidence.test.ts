import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../skill-state/confidence.js';
import { normalizeEvidence } from '../evidence/normalize.js';
import { makeRawEvidence, daysAgoIso, NOW } from './helpers.js';

describe('computeConfidence', () => {
  it('is LOW with zero evidence', () => {
    const result = computeConfidence([], NOW);
    expect(result.level).toBe('LOW');
    expect(result.evidenceCount).toBe(0);
  });

  it('is LOW for a single self-reported claim — section 8: a claim is not evidence of mastery', () => {
    const ev = normalizeEvidence(makeRawEvidence({ skillId: 'binary-search', evidenceType: 'SELF_REPORTED', timestamp: NOW }));
    expect(computeConfidence([ev], NOW).level).toBe('LOW');
  });

  it('rises from LOW toward HIGH as deterministic evidence accumulates', () => {
    const one = [normalizeEvidence(makeRawEvidence({ skillId: 's', evidenceType: 'DETERMINISTIC', timestamp: NOW }))];
    const ten = Array.from({ length: 10 }, (_, i) =>
      normalizeEvidence(
        makeRawEvidence({
          skillId: 's',
          evidenceType: 'DETERMINISTIC',
          source: i % 3 === 0 ? 'correctness' : i % 3 === 1 ? 'debugging' : 'reasoning',
          timestamp: daysAgoIso(i, NOW),
        }),
      ),
    );

    const oneResult = computeConfidence(one, NOW);
    const tenResult = computeConfidence(ten, NOW);

    expect(oneResult.level).toBe('LOW');
    expect(tenResult.score).toBeGreaterThan(oneResult.score);
    expect(tenResult.level).toBe('HIGH');
  });

  it('rewards source diversity beyond raw volume — section 9', () => {
    const singleSource = Array.from({ length: 8 }, (_, i) =>
      normalizeEvidence(makeRawEvidence({ skillId: 's', evidenceType: 'DETERMINISTIC', source: 'correctness', timestamp: daysAgoIso(i, NOW) })),
    );
    const diverseSources = Array.from({ length: 8 }, (_, i) =>
      normalizeEvidence(
        makeRawEvidence({
          skillId: 's',
          evidenceType: 'DETERMINISTIC',
          source: (['correctness', 'debugging', 'reasoning', 'understanding'] as const)[i % 4],
          timestamp: daysAgoIso(i, NOW),
        }),
      ),
    );

    const singleResult = computeConfidence(singleSource, NOW);
    const diverseResult = computeConfidence(diverseSources, NOW);

    expect(diverseResult.distinctSources).toBeGreaterThan(singleResult.distinctSources);
    expect(diverseResult.score).toBeGreaterThanOrEqual(singleResult.score);
  });

  it('decays old evidence relative to recent evidence of the same type', () => {
    const old = [normalizeEvidence(makeRawEvidence({ skillId: 's', evidenceType: 'DETERMINISTIC', timestamp: daysAgoIso(400, NOW) }))];
    const recent = [normalizeEvidence(makeRawEvidence({ skillId: 's', evidenceType: 'DETERMINISTIC', timestamp: NOW }))];

    expect(computeConfidence(recent, NOW).score).toBeGreaterThan(computeConfidence(old, NOW).score);
  });
});
