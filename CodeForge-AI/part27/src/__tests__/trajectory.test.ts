import { describe, it, expect } from 'vitest';
import { computeTrajectory } from '../trajectory/trajectory-engine.js';
import { normalizeEvidence } from '../evidence/normalize.js';
import { makeRawEvidence, daysAgoIso, NOW } from './helpers.js';

describe('computeTrajectory', () => {
  it('reports INSUFFICIENT_EVIDENCE with too little history to compare windows — section 16', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', timestamp: NOW }))];
    expect(computeTrajectory(evidence, NOW).trajectory).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('detects an improving trend from a genuinely weaker prior window', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(20, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(22, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(4, NOW) })),
    ];
    expect(['IMPROVING', 'RAPIDLY_IMPROVING']).toContain(computeTrajectory(evidence, NOW).trajectory);
  });

  it('detects a declining trend', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(20, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(22, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(4, NOW) })),
    ];
    expect(computeTrajectory(evidence, NOW).trajectory).toBe('DECLINING');
  });

  it('labels an improving trend as RECOVERING when the student was previously AT_RISK — section 24', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(20, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'negative', timestamp: daysAgoIso(22, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(4, NOW) })),
    ];
    expect(computeTrajectory(evidence, NOW, 'AT_RISK').trajectory).toBe('RECOVERING');
  });

  it('reports STABLE when recent and prior windows look alike', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(20, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(22, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(2, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', timestamp: daysAgoIso(4, NOW) })),
    ];
    expect(computeTrajectory(evidence, NOW).trajectory).toBe('STABLE');
  });
});
