import { describe, it, expect } from 'vitest';
import { computeTransferState, computeRetentionState } from '../analysis/index.js';
import { normalizeEvidence } from '../evidence/normalize.js';
import { makeRawEvidence, daysAgoIso, NOW } from './helpers.js';

describe('computeTransferState', () => {
  it('is UNKNOWN below the minimum transfer-attempt signal threshold', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', transferContext: { isTransferAttempt: true, novelContext: 'strings' }, timestamp: NOW }))];
    expect(computeTransferState(evidence)).toBe('UNKNOWN');
  });

  it('caps at MODERATE when success is confined to a single novel context — section 26', () => {
    const evidence = Array.from({ length: 4 }, (_, i) =>
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', transferContext: { isTransferAttempt: true, novelContext: 'strings' }, timestamp: daysAgoIso(i, NOW) })),
    );
    expect(computeTransferState(evidence)).toBe('MODERATE');
  });

  it('reaches STRONG only once success spans multiple distinct novel contexts', () => {
    const evidence = [
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', transferContext: { isTransferAttempt: true, novelContext: 'strings' }, timestamp: daysAgoIso(3, NOW) })),
      normalizeEvidence(makeRawEvidence({ skillId: 's', outcome: 'positive', transferContext: { isTransferAttempt: true, novelContext: 'streaming-data' }, timestamp: daysAgoIso(1, NOW) })),
    ];
    expect(computeTransferState(evidence)).toBe('STRONG');
  });
});

describe('computeRetentionState', () => {
  it('is UNKNOWN for a skill that has not been meaningfully introduced', () => {
    expect(computeRetentionState([], NOW, 'UNKNOWN')).toBe('UNKNOWN');
  });

  it('is RETAINED shortly after the last demonstration', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', timestamp: daysAgoIso(2, NOW) }))];
    expect(computeRetentionState(evidence, NOW, 'PROFICIENT')).toBe('RETAINED');
  });

  it('degrades to LOST_CONFIDENCE after a long gap on a lightly-established skill', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', timestamp: daysAgoIso(90, NOW) }))];
    expect(computeRetentionState(evidence, NOW, 'DEVELOPING')).toBe('LOST_CONFIDENCE');
  });

  it('gives a MASTERED skill a longer retention grace period than a DEVELOPING one — section 25', () => {
    const evidence = [normalizeEvidence(makeRawEvidence({ skillId: 's', timestamp: daysAgoIso(50, NOW) }))];
    const order = ['RETAINED', 'AT_RISK', 'REQUIRES_REINFORCEMENT', 'LOST_CONFIDENCE'];
    const mastered = computeRetentionState(evidence, NOW, 'MASTERED');
    const developing = computeRetentionState(evidence, NOW, 'DEVELOPING');
    expect(order.indexOf(mastered)).toBeLessThanOrEqual(order.indexOf(developing));
  });
});
