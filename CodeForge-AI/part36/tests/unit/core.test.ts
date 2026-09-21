import { describe, it, expect } from 'vitest';
import { computeCoverage, applyPrivacyThreshold, canMakeStrengthClaim } from '../../src/core/coverage';
import { buildMasteryDistribution, dominantLevel, computeTrend, classifyGapPriority } from '../../src/core/distribution';
import { scoreTrainingPriority, classifyInterventions } from '../../src/core/prioritization';
import { assertBelongsToOrganization, assertComparable } from '../../src/core/guards';
import { MasteryLevel, EvidenceCoverageState, TrendDirection, GapPriority, InterventionCategory } from '../../src/domain/enums';
import { NotFoundError } from '../../src/utils/errors';

describe('computeCoverage', () => {
  it('reports INSUFFICIENT when coverage is below the low threshold (golden scenario #69: SQL -> Insufficient Evidence, not Weak)', () => {
    const result = computeCoverage(100, 20); // 20%
    expect(result.coverageState).toBe(EvidenceCoverageState.INSUFFICIENT);
    expect(canMakeStrengthClaim(result)).toBe(false);
  });

  it('reports HIGH coverage for a well-assessed cohort (golden scenario #68: strong Python signal)', () => {
    const result = computeCoverage(100, 90);
    expect(result.coverageState).toBe(EvidenceCoverageState.HIGH);
    expect(canMakeStrengthClaim(result)).toBe(true);
  });

  it('never divides by zero when there are no eligible students', () => {
    const result = computeCoverage(0, 0);
    expect(result.coveragePct).toBe(0);
    expect(result.coverageState).toBe(EvidenceCoverageState.INSUFFICIENT);
  });

  it('rejects impossible inputs', () => {
    expect(() => computeCoverage(10, 20)).toThrow();
    expect(() => computeCoverage(-1, 0)).toThrow();
  });
});

describe('applyPrivacyThreshold', () => {
  it('restricts aggregates for cohorts smaller than the policy minimum (golden scenario #71)', () => {
    const result = applyPrivacyThreshold(4, { minCohortSize: 10 });
    expect(result.restricted).toBe(true);
  });

  it('allows aggregates once the cohort clears the minimum', () => {
    const result = applyPrivacyThreshold(10, { minCohortSize: 10 });
    expect(result.restricted).toBe(false);
  });
});

describe('dominantLevel', () => {
  it('returns null when coverage is insufficient, even if a couple of students have strong signals', () => {
    const distribution = buildMasteryDistribution([MasteryLevel.STRONG, MasteryLevel.STRONG]);
    const coverage = computeCoverage(50, 2); // 4% coverage
    expect(dominantLevel(distribution, coverage)).toBeNull();
  });

  it('returns the most common assessed level once coverage is sufficient', () => {
    const distribution = buildMasteryDistribution([MasteryLevel.PROFICIENT, MasteryLevel.PROFICIENT, MasteryLevel.DEVELOPING]);
    const coverage = computeCoverage(3, 3);
    expect(dominantLevel(distribution, coverage)).toBe(MasteryLevel.PROFICIENT);
  });
});

describe('computeTrend', () => {
  const highCoverage = computeCoverage(100, 90);
  const lowCoverage = computeCoverage(100, 10);

  it('reports INSUFFICIENT_EVIDENCE when either period lacks coverage', () => {
    const result = computeTrend({
      previousProficientShare: 0.4,
      currentProficientShare: 0.6,
      previousCoverage: lowCoverage,
      currentCoverage: highCoverage,
    });
    expect(result.direction).toBe(TrendDirection.INSUFFICIENT_EVIDENCE);
  });

  it('reports IMPROVING for a meaningful positive shift with sufficient coverage (golden scenario #70)', () => {
    const result = computeTrend({
      previousProficientShare: 0.3,
      currentProficientShare: 0.55,
      previousCoverage: highCoverage,
      currentCoverage: highCoverage,
    });
    expect(result.direction).toBe(TrendDirection.IMPROVING);
  });

  it('reports STABLE for small shifts rather than claiming false precision', () => {
    const result = computeTrend({
      previousProficientShare: 0.5,
      currentProficientShare: 0.52,
      previousCoverage: highCoverage,
      currentCoverage: highCoverage,
    });
    expect(result.direction).toBe(TrendDirection.STABLE);
  });
});

describe('classifyGapPriority', () => {
  it('returns INSUFFICIENT_EVIDENCE when coverage is too low to claim a gap at all', () => {
    const coverage = computeCoverage(100, 15);
    const result = classifyGapPriority({
      roleImportance: 0.9,
      observedProficiencyShare: 0.1,
      placementRelevance: 0.9,
      affectedStudents: 50,
      coverage,
    });
    expect(result).toBe(GapPriority.INSUFFICIENT_EVIDENCE);
  });

  it('returns HIGH for a severe, high-importance, well-evidenced gap', () => {
    const coverage = computeCoverage(100, 90);
    const result = classifyGapPriority({
      roleImportance: 0.9,
      observedProficiencyShare: 0.1,
      placementRelevance: 0.9,
      affectedStudents: 50,
      coverage,
    });
    expect(result).toBe(GapPriority.HIGH);
  });
});

describe('scoreTrainingPriority', () => {
  it('never surfaces a fake score for insufficient-evidence gaps', () => {
    const result = scoreTrainingPriority({
      label: 'SQL',
      gapPriority: GapPriority.INSUFFICIENT_EVIDENCE,
      affectedStudents: 0,
      roleImportance: 0.8,
      trainingImpactPotential: 0.8,
    });
    expect(result.score).toBe(0);
    expect(result.rationale[0]).toMatch(/insufficient/i);
  });

  it('ranks HIGH-priority gaps above MODERATE ones (section 20)', () => {
    const high = scoreTrainingPriority({ label: 'A', gapPriority: GapPriority.HIGH, affectedStudents: 10, roleImportance: 0.7, trainingImpactPotential: 0.6 });
    const moderate = scoreTrainingPriority({ label: 'B', gapPriority: GapPriority.MODERATE, affectedStudents: 10, roleImportance: 0.7, trainingImpactPotential: 0.6 });
    expect(high.score).toBeGreaterThan(moderate.score);
  });
});

describe('classifyInterventions', () => {
  it('flags foundation support when most of the cohort is unassessed or emerging', () => {
    const distribution: Record<MasteryLevel, number> = {
      [MasteryLevel.NOT_ASSESSED]: 40,
      [MasteryLevel.EMERGING]: 20,
      [MasteryLevel.DEVELOPING]: 10,
      [MasteryLevel.PROFICIENT]: 5,
      [MasteryLevel.STRONG]: 5,
    };
    const categories = classifyInterventions({ distribution, interviewVerificationRate: 0.5, roleSpecificGap: false });
    expect(categories).toContain(InterventionCategory.NEEDS_FOUNDATION_SUPPORT);
  });

  it('returns nothing for an empty cohort rather than dividing by zero', () => {
    const distribution: Record<MasteryLevel, number> = {
      [MasteryLevel.NOT_ASSESSED]: 0,
      [MasteryLevel.EMERGING]: 0,
      [MasteryLevel.DEVELOPING]: 0,
      [MasteryLevel.PROFICIENT]: 0,
      [MasteryLevel.STRONG]: 0,
    };
    expect(classifyInterventions({ distribution, interviewVerificationRate: 0, roleSpecificGap: false })).toEqual([]);
  });
});

describe('assertBelongsToOrganization (tenant isolation, golden scenario #72)', () => {
  it('throws NotFoundError for a cross-tenant entity instead of leaking existence', () => {
    const entity = { organizationId: 'org_B', name: 'secret' };
    expect(() => assertBelongsToOrganization(entity, 'org_A')).toThrow(NotFoundError);
  });

  it('returns the entity when the tenant matches', () => {
    const entity = { organizationId: 'org_A', name: 'ok' };
    expect(assertBelongsToOrganization(entity, 'org_A')).toBe(entity);
  });
});

describe('assertComparable (comparison guardrails, section 39)', () => {
  const base = { cohortId: 'a', roleModelVersion: 'v1', assessmentSchemaVersion: 's1', coveragePct: 0.5, cohortSize: 20 };

  it('blocks comparison when cohorts are too small', () => {
    const result = assertComparable(base, { ...base, cohortId: 'b', cohortSize: 3 });
    expect(result.allowed).toBe(false);
  });

  it('blocks comparison when role models differ', () => {
    const result = assertComparable(base, { ...base, cohortId: 'b', roleModelVersion: 'v2' });
    expect(result.allowed).toBe(false);
  });

  it('allows comparison when everything lines up', () => {
    const result = assertComparable(base, { ...base, cohortId: 'b' });
    expect(result.allowed).toBe(true);
  });
});
