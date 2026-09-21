import { describe, it, expect } from 'vitest';
import { detectRegression, detectRecovery } from '../analysis/index.js';
import { normalizeEvidence } from '../evidence/normalize.js';
import { makeRawEvidence, daysAgoIso, NOW } from './helpers.js';

describe('detectRegression', () => {
  it('does not flag regression from one isolated failure amid recent successes — section 12', () => {
    const evidence = [
      ...Array.from({ length: 8 }, (_, i) => normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(i + 1, NOW) }))),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: NOW })),
    ];
    const result = detectRegression(evidence, NOW, null);
    expect(result.isRegressing).toBe(false);
    expect(result.consecutiveNegative).toBe(1);
  });

  it('flags regression after a sustained run of negative evidence — section 22', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(10, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(6, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(4, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(2, NOW) })),
    ];
    const result = detectRegression(evidence, NOW, null);
    expect(result.isRegressing).toBe(true);
    expect(result.consecutiveNegative).toBe(3);
  });

  it('assigns CRITICAL severity to a large drop from a high prior stable score — section 23', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(4, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(6, NOW) })),
    ];
    const result = detectRegression(evidence, NOW, 0.9);
    expect(result.isRegressing).toBe(true);
    expect(result.severity).toBe('CRITICAL');
  });
});

describe('detectRecovery', () => {
  it('does nothing for a skill that was never in decline', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: NOW }))];
    expect(detectRecovery(evidence, 'PROFICIENT').isRecovering).toBe(false);
  });

  it('detects partial recovery from AT_RISK with a single positive record — not yet confirmed', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(3, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: NOW })),
    ];
    const result = detectRecovery(evidence, 'AT_RISK');
    expect(result.isRecovering).toBe(true);
    expect(result.isFullyRecovered).toBe(false);
  });

  it('confirms full recovery after a sustained positive streak following a decline — section 24', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(10, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(4, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: NOW })),
    ];
    expect(detectRecovery(evidence, 'REGRESSING').isFullyRecovered).toBe(true);
  });
});
