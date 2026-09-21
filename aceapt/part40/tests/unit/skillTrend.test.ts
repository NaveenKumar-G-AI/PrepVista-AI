import { describe, it, expect } from 'vitest';
import { classifySkillTrend } from '../../src/services/skillTrend.service';

describe('classifySkillTrend', () => {
  it('returns UNKNOWN with fewer than 2 data points', () => {
    expect(classifySkillTrend([0.5])).toBe('UNKNOWN');
    expect(classifySkillTrend([])).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when the skill never shows up meaningfully', () => {
    expect(classifySkillTrend([0.01, 0.02, 0.01])).toBe('UNKNOWN');
  });

  it('returns DURABLE for a skill that stays high and stable across >=3 periods', () => {
    expect(classifySkillTrend([0.9, 0.87, 0.85])).toBe('DURABLE');
  });

  it('tolerates realistic sampling noise within the stable band without misclassifying as DECLINING', () => {
    // Regression test for a real bug found while seeding: an 8.7-point swing
    // from sampling noise alone was originally misclassified DECLINING.
    expect(classifySkillTrend([0.933, 0.887, 0.847])).toBe('DURABLE');
  });

  it('returns DECLINING when a skill drops significantly and consistently', () => {
    expect(classifySkillTrend([0.3, 0.2, 0.1])).toBe('DECLINING');
  });

  it('returns GROWING when a skill is already substantial and still rising, even from a near-zero start', () => {
    // Spec ??14: EMERGING is "early" -- a skill already at 60% isn't early
    // anymore, even if it started near zero.
    expect(classifySkillTrend([0.03, 0.25, 0.6])).toBe('GROWING');
  });

  it('returns EMERGING for a skill newly appearing but still at a modest level', () => {
    expect(classifySkillTrend([0.0, 0.06, 0.12])).toBe('EMERGING');
  });

  it('returns ROLE_SPECIFIC for a skill holding a modest, steady level', () => {
    expect(classifySkillTrend([0.05, 0.1, 0.13])).toBe('ROLE_SPECIFIC');
  });
});
