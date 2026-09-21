import { aggregateEvidence } from '../../src/services/evidenceAggregation.service';
import type { EvidenceEventLike } from '../../src/domain/types';

function events(pattern: Array<boolean | null>): EvidenceEventLike[] {
  const now = Date.now();
  return pattern.map((isCorrect, i) => ({ isCorrect, weight: 1, occurredAt: new Date(now - (pattern.length - i) * 1000) }));
}

describe('evidenceAggregation.service', () => {
  test('zero evidence is UNKNOWN with a null capability, never a fabricated score', () => {
    const result = aggregateEvidence([]);
    expect(result.capability).toBeNull();
    expect(result.state).toBe('UNKNOWN');
    expect(result.confidence).toBe('NONE');
    expect(result.evidenceCount).toBe(0);
  });

  test('a handful of mostly-correct events yields STRONG or MASTERED, not UNKNOWN', () => {
    const result = aggregateEvidence(events([true, true, true, true, true]));
    expect(result.capability).not.toBeNull();
    expect(['STRONG', 'MASTERED']).toContain(result.state);
  });

  test('mostly-incorrect events yield DEVELOPING with a low capability number', () => {
    const result = aggregateEvidence(events([false, false, true, false, false]));
    expect(result.state).toBe('DEVELOPING');
    expect(result.capability).toBeLessThan(60);
  });

  test('confidence scales with evidence count regardless of the score', () => {
    expect(aggregateEvidence(events([true, true])).confidence).toBe('LOW'); // n=2
    expect(aggregateEvidence(events([true, true, true])).confidence).toBe('MODERATE'); // n=3
    expect(aggregateEvidence(events(Array(10).fill(true))).confidence).toBe('HIGH'); // n=10
  });

  test('a clear improvement across the evidence window is flagged IMPROVING', () => {
    const result = aggregateEvidence(events([false, false, false, true, true, true]));
    expect(result.trend).toBe('IMPROVING');
  });

  test('a clear decline across the evidence window is flagged DECLINING', () => {
    const result = aggregateEvidence(events([true, true, true, false, false, false]));
    expect(result.trend).toBe('DECLINING');
  });

  test('fewer than 4 events yields no trend rather than a noisy guess', () => {
    const result = aggregateEvidence(events([true, false, true]));
    expect(result.trend).toBeNull();
  });

  test('a strong score with retentionDeclining=true becomes MAINTENANCE, not MASTERED', () => {
    const result = aggregateEvidence(events(Array(10).fill(true)), true);
    expect(result.state).toBe('MAINTENANCE');
  });

  test('a strong score with no retention decline is MASTERED', () => {
    const result = aggregateEvidence(events(Array(10).fill(true)), false);
    expect(result.state).toBe('MASTERED');
  });

  test('more recent events are weighted more heavily than older ones', () => {
    // Same 3-correct-out-of-5 split, but recent-correct should score higher than recent-incorrect.
    const recentGood = aggregateEvidence(events([false, false, true, true, true]));
    const recentBad = aggregateEvidence(events([true, true, true, false, false]));
    expect(recentGood.capability!).toBeGreaterThan(recentBad.capability!);
  });
});
