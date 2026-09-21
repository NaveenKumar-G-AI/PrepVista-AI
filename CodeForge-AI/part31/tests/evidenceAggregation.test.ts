import { describe, expect, it } from 'vitest';
import { aggregateSkillEvidence } from '../src/domain/evidenceAggregation';
import { ev, NOW, daysAgo, unstableEvidence } from './fixtures/roleModels';

const REQ = { minEvidenceCount: 3, minTier: 'verified_understanding' as const };

describe('aggregateSkillEvidence', () => {
  it('returns unassessed (not a numeric zero) when there is no evidence', () => {
    const signal = aggregateSkillEvidence('sql', [], REQ, { now: NOW });
    expect(signal.status).toBe('unassessed');
    expect(signal.mastery).toBe('unassessed');
    expect(signal.masteryScoreEstimate).toBeNull();
    expect(signal.evidenceCount).toBe(0);
  });

  it('returns insufficient_evidence when evidence exists but is below the required count', () => {
    const evidence = [ev('sql', 90, { tier: 'verified_direct_performance', timestamp: daysAgo(5) })];
    const signal = aggregateSkillEvidence('sql', evidence, REQ, { now: NOW });
    expect(signal.status).toBe('insufficient_evidence');
    // still reports a best-estimate mastery, but status is the authority on trust
    expect(signal.masteryScoreEstimate).not.toBeNull();
  });

  it('returns assessed once enough qualifying evidence exists', () => {
    const evidence = [
      ev('sql', 88, { tier: 'verified_direct_performance', timestamp: daysAgo(5) }),
      ev('sql', 85, { tier: 'verified_direct_performance', timestamp: daysAgo(10) }),
      ev('sql', 90, { tier: 'verified_direct_performance', timestamp: daysAgo(15) }),
    ];
    const signal = aggregateSkillEvidence('sql', evidence, REQ, { now: NOW });
    expect(signal.status).toBe('assessed');
    expect(signal.mastery).not.toBe('unassessed');
  });

  it('ignores evidence below the required tier when counting toward "assessed"', () => {
    const evidence = [
      ev('sql', 90, { tier: 'weak_indirect', timestamp: daysAgo(1) }),
      ev('sql', 90, { tier: 'weak_indirect', timestamp: daysAgo(2) }),
      ev('sql', 90, { tier: 'weak_indirect', timestamp: daysAgo(3) }),
    ];
    const signal = aggregateSkillEvidence('sql', evidence, REQ, { now: NOW });
    expect(signal.qualifyingEvidenceCount).toBe(0);
    expect(signal.status).toBe('insufficient_evidence');
  });

  it('flags unstable consistency only once there is a real sample, not from 1-2 points', () => {
    const tinySample = unstableEvidence('debug', [95, 30]);
    const tinySignal = aggregateSkillEvidence('debug', tinySample, REQ, { now: NOW });
    expect(tinySignal.consistency).toBe('insufficient_sample');

    const realSample = unstableEvidence('debug', [95, 30, 92, 28, 90, 35]);
    const realSignal = aggregateSkillEvidence('debug', realSample, REQ, { now: NOW });
    expect(realSignal.consistency).toBe('unstable');
  });

  it('flags stable consistency for a real sample with low variance', () => {
    const evidence = unstableEvidence('debug', [90, 88, 91, 93, 89, 92]);
    const signal = aggregateSkillEvidence('debug', evidence, REQ, { now: NOW });
    expect(signal.consistency).toBe('stable');
  });

  it('detects an improving trend from chronologically increasing scores', () => {
    const evidence = [
      ev('api', 50, { tier: 'verified_understanding', timestamp: daysAgo(60) }),
      ev('api', 55, { tier: 'verified_understanding', timestamp: daysAgo(50) }),
      ev('api', 52, { tier: 'verified_understanding', timestamp: daysAgo(40) }),
      ev('api', 85, { tier: 'verified_understanding', timestamp: daysAgo(10) }),
      ev('api', 88, { tier: 'verified_understanding', timestamp: daysAgo(5) }),
      ev('api', 90, { tier: 'verified_understanding', timestamp: daysAgo(1) }),
    ];
    const signal = aggregateSkillEvidence('api', evidence, REQ, { now: NOW });
    expect(signal.trend).toBe('improving');
  });

  it('marks dataAvailability as source_unavailable when told to, without treating it as unassessed evidence', () => {
    const signal = aggregateSkillEvidence('sql', [], REQ, { now: NOW, dataAvailability: 'source_unavailable' });
    expect(signal.dataAvailability).toBe('source_unavailable');
    expect(signal.status).toBe('unassessed'); // still correctly "unknown", not "failed"
  });

  it('discounts old evidence relative to recent evidence of the same score', () => {
    const oldEvidence = [ev('sql', 90, { tier: 'verified_direct_performance', timestamp: daysAgo(400) })];
    const recentEvidence = [ev('sql', 90, { tier: 'verified_direct_performance', timestamp: daysAgo(1) })];
    const oldSignal = aggregateSkillEvidence('sql', oldEvidence, REQ, { now: NOW });
    const recentSignal = aggregateSkillEvidence('sql', recentEvidence, REQ, { now: NOW });
    expect(oldSignal.recencyScore).toBeLessThan(recentSignal.recencyScore);
  });
});
