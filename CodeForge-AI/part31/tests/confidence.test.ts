import { describe, expect, it } from 'vitest';
import { bucketConfidence, computeSkillConfidence } from '../src/domain/confidence';
import { aggregateSkillEvidence } from '../src/domain/evidenceAggregation';
import { BACKEND_DEVELOPER_ROLE, NOW, strongEvidence, unstableEvidence } from './fixtures/roleModels';

const programmingReq = BACKEND_DEVELOPER_ROLE.skills.find((s) => s.skillId === 'skill_programming')!;

describe('computeSkillConfidence', () => {
  it('is very low for an unassessed skill', () => {
    const signal = aggregateSkillEvidence('skill_programming', [], programmingReq.evidenceRequirement, { now: NOW });
    const score = computeSkillConfidence(signal, programmingReq);
    expect(bucketConfidence(score)).toBe('low');
  });

  it('is high given extensive, diverse, recent, stable evidence', () => {
    const evidence = strongEvidence('skill_programming', 8, 88);
    const signal = aggregateSkillEvidence('skill_programming', evidence, programmingReq.evidenceRequirement, { now: NOW });
    const score = computeSkillConfidence(signal, programmingReq);
    expect(bucketConfidence(score)).toBe('high');
  });

  it('is lower for inconsistent performance than for stable performance at a similar average', () => {
    const stable = unstableEvidence('skill_programming', [80, 82, 79, 81, 80, 83]);
    const unstable = unstableEvidence('skill_programming', [98, 55, 95, 50, 96, 52]); // wide, clearly-crossing-threshold variance

    const stableSignal = aggregateSkillEvidence('skill_programming', stable, programmingReq.evidenceRequirement, { now: NOW });
    const unstableSignal = aggregateSkillEvidence('skill_programming', unstable, programmingReq.evidenceRequirement, {
      now: NOW,
    });

    const stableConfidence = computeSkillConfidence(stableSignal, programmingReq);
    const unstableConfidence = computeSkillConfidence(unstableSignal, programmingReq);

    expect(unstableConfidence).toBeLessThan(stableConfidence);
  });

  it('does not let a single repeated identical task create extreme confidence (Phase 18)', () => {
    const repeated = Array.from({ length: 10 }, () => strongEvidence('skill_programming', 1, 90)[0]);
    const diverse = strongEvidence('skill_programming', 6, 88); // varied task types + difficulties

    const repeatedSignal = aggregateSkillEvidence('skill_programming', repeated, programmingReq.evidenceRequirement, {
      now: NOW,
    });
    const diverseSignal = aggregateSkillEvidence('skill_programming', diverse, programmingReq.evidenceRequirement, {
      now: NOW,
    });

    const repeatedConfidence = computeSkillConfidence(repeatedSignal, programmingReq);
    const diverseConfidence = computeSkillConfidence(diverseSignal, programmingReq);

    expect(diverseConfidence).toBeGreaterThan(repeatedConfidence);
  });
});
