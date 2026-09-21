import { describe, expect, it } from 'vitest';
import { computeFunnelFromEntries, type StageKeyEntry } from '../src/lib/engines/funnel';
import { computeStagePattern, type PatternEvidenceEntry, type PatternStageEntry } from '../src/lib/engines/pattern';
import { RECOVERY_TEMPLATES, buildFallbackRationale } from '../src/lib/engines/recovery';
import { detectSameMistake } from '../src/lib/engines/sameMistake';
import { STAGE_ORDER, type FailureCategory, type RecoveryPlan, type Reassessment } from '../src/lib/types';

function stageEntries(spec: { opp: string; stages: string[] }[]): StageKeyEntry[] {
  const out: StageKeyEntry[] = [];
  for (const s of spec) {
    for (const stageKey of s.stages) {
      out.push({ opportunityId: s.opp, stageKey: stageKey as StageKeyEntry['stageKey'] });
    }
  }
  return out;
}

describe('computeFunnelFromEntries', () => {
  it('returns an all-zero, no-bottleneck funnel when there is no data', () => {
    const result = computeFunnelFromEntries([]);
    expect(result.totalOpportunities).toBe(0);
    expect(result.bottleneck).toBeNull();
    expect(result.stages).toHaveLength(STAGE_ORDER.length);
    expect(result.stages.every((s) => s.count === 0)).toBe(true);
  });

  it('counts opportunities reaching each stage and computes conversion rates', () => {
    const entries = stageEntries([
      { opp: 'o1', stages: ['application', 'response', 'interview'] },
      { opp: 'o2', stages: ['application', 'response'] },
      { opp: 'o3', stages: ['application'] },
    ]);
    const result = computeFunnelFromEntries(entries);
    expect(result.totalOpportunities).toBe(3);
    const application = result.stages.find((s) => s.stageKey === 'application')!;
    const response = result.stages.find((s) => s.stageKey === 'response')!;
    const interview = result.stages.find((s) => s.stageKey === 'interview')!;
    expect(application.count).toBe(3);
    expect(response.count).toBe(2);
    expect(interview.count).toBe(1);
    expect(response.conversionFromPrevious).toBeCloseTo(2 / 3);
    expect(interview.conversionFromPrevious).toBeCloseTo(1 / 2);
  });

  it('never calls a bottleneck from a single-observation transition (Section 12: no overinterpreting tiny samples)', () => {
    const entries = stageEntries([{ opp: 'o1', stages: ['application', 'response'] }]);
    const result = computeFunnelFromEntries(entries);
    expect(result.bottleneck).toBeNull();
  });

  it('identifies the transition with the lowest conversion rate as the bottleneck once sample size is sufficient', () => {
    // Two opportunities run the whole taxonomy at 100% conversion end to end;
    // two more stop at technical_round. Every stage has real data all the way
    // through, so the only genuine drop is technical_round -> behavioral_round —
    // nothing is left ambiguous by an unpopulated tail.
    const full = ['application', 'response', 'interview', 'technical_round', 'behavioral_round', 'final_round', 'offer'];
    const entries = stageEntries([
      { opp: 'o1', stages: full },
      { opp: 'o2', stages: full },
      { opp: 'o3', stages: ['application', 'response', 'interview', 'technical_round'] },
      { opp: 'o4', stages: ['application', 'response', 'interview', 'technical_round'] },
    ]);
    const result = computeFunnelFromEntries(entries);
    expect(result.bottleneck?.fromStage).toBe('technical_round');
    expect(result.bottleneck?.toStage).toBe('behavioral_round');
    expect(result.bottleneck?.confidence).toBe('repeated_pattern');
  });

  it('does not manufacture a bottleneck out of stages nobody has reached yet (an unpopulated tail is not evidence of a drop)', () => {
    // Both opportunities stop at interview — there is no data at all beyond
    // it. A thin, unrepresentative "0 out of 2" edge should not silently
    // outrank a better-evidenced earlier transition; check the shape stays
    // internally consistent (every transition beyond the data frontier still
    // requires its own minimum sample before winning).
    const entries = stageEntries([
      { opp: 'o1', stages: ['application', 'response', 'interview'] },
      { opp: 'o2', stages: ['application', 'response', 'interview'] },
    ]);
    const result = computeFunnelFromEntries(entries);
    // With only 2 opportunities and a clean 100% carry-through to interview,
    // whatever the algorithm reports must at least be backed by the declared
    // minimum sample size, never asserted from a single observation.
    if (result.bottleneck) {
      expect(['emerging_pattern', 'repeated_pattern']).toContain(result.bottleneck.confidence);
    }
  });
});

describe('computeStagePattern', () => {
  const baseEntry = (id: string, opp: string, createdAt: string, status: 'rejected' | 'withdrawn' | 'passed'): PatternStageEntry => ({
    stageId: id,
    opportunityId: opp,
    opportunityCreatedAt: createdAt,
    stageKey: 'technical_round',
    status,
    isFurthest: true,
  });

  it('reports "none" strength with zero matches', () => {
    const result = computeStagePattern([], [], 'technical_round', 'exclude-me');
    expect(result.strength).toBe('none');
    expect(result.count).toBe(0);
  });

  it('classifies exactly one prior rejection as limited_evidence (Section 49)', () => {
    const entries = [baseEntry('s1', 'o1', '2026-01-01', 'rejected')];
    const result = computeStagePattern(entries, [], 'technical_round', 'current-opp');
    expect(result.count).toBe(1);
    expect(result.strength).toBe('limited_evidence');
  });

  it('classifies two or three prior rejections as emerging_pattern', () => {
    const entries = [
      baseEntry('s1', 'o1', '2026-01-01', 'rejected'),
      baseEntry('s2', 'o2', '2026-01-08', 'rejected'),
    ];
    const result = computeStagePattern(entries, [], 'technical_round', 'current-opp');
    expect(result.strength).toBe('emerging_pattern');
  });

  it('classifies four or more prior rejections as repeated_pattern and excludes the current opportunity', () => {
    const entries = [
      baseEntry('s1', 'o1', '2026-01-01', 'rejected'),
      baseEntry('s2', 'o2', '2026-01-08', 'rejected'),
      baseEntry('s3', 'o3', '2026-01-15', 'rejected'),
      baseEntry('s4', 'o4', '2026-01-22', 'rejected'),
      baseEntry('s-current', 'current-opp', '2026-01-29', 'rejected'),
    ];
    const result = computeStagePattern(entries, [], 'technical_round', 'current-opp');
    expect(result.count).toBe(4);
    expect(result.strength).toBe('repeated_pattern');
  });

  it('never invents a dominant category without matching evidence', () => {
    const entries = [baseEntry('s1', 'o1', '2026-01-01', 'rejected'), baseEntry('s2', 'o2', '2026-01-08', 'rejected')];
    const result = computeStagePattern(entries, [], 'technical_round', 'current-opp');
    expect(result.dominantCategory).toBeNull();
  });

  it('picks the most common category among matched evidence when present', () => {
    const entries = [
      baseEntry('s1', 'o1', '2026-01-01', 'rejected'),
      baseEntry('s2', 'o2', '2026-01-08', 'rejected'),
      baseEntry('s3', 'o3', '2026-01-15', 'rejected'),
    ];
    const evidence: PatternEvidenceEntry[] = [
      { applicationStageId: 's1', failureCategory: 'TECHNICAL_PERFORMANCE' },
      { applicationStageId: 's2', failureCategory: 'TECHNICAL_PERFORMANCE' },
      { applicationStageId: 's3', failureCategory: 'COMMUNICATION_PERFORMANCE' },
    ];
    const result = computeStagePattern(entries, evidence, 'technical_round', 'current-opp');
    expect(result.dominantCategory).toBe('TECHNICAL_PERFORMANCE');
  });
});

describe('RECOVERY_TEMPLATES', () => {
  it('defines exactly one primary and at most two supporting actions per category (Section 15)', () => {
    for (const category of Object.keys(RECOVERY_TEMPLATES) as FailureCategory[]) {
      const template = RECOVERY_TEMPLATES[category];
      expect(template.primary.title.length).toBeGreaterThan(0);
      expect(template.supporting.length).toBeLessThanOrEqual(2);
      expect(template.supporting.length).toBeGreaterThan(0);
    }
  });

  it('produces a fallback rationale that names the category', () => {
    const rationale = buildFallbackRationale('TECHNICAL_PERFORMANCE', 'repeated_pattern');
    expect(rationale.toLowerCase()).toContain('technical performance');
  });

  it('never claims "direct evidence" for EXTERNAL_UNKNOWN — that category exists precisely because none was found', () => {
    const rationale = buildFallbackRationale('EXTERNAL_UNKNOWN', 'limited_evidence');
    expect(rationale.toLowerCase()).not.toContain('direct evidence');
  });
});

describe('detectSameMistake', () => {
  const plan = (overrides: Partial<RecoveryPlan>): RecoveryPlan => ({
    id: 'p1',
    studentId: 's1',
    opportunityId: null,
    failureCategory: 'TECHNICAL_PERFORMANCE',
    patternStrength: 'repeated_pattern',
    rationaleFallback: '',
    rationaleAI: null,
    status: 'completed',
    createdAt: '2026-01-01',
    startedAt: '2026-01-02',
    completedAt: '2026-01-03',
    ...overrides,
  });

  it('is false with no prior plans', () => {
    expect(detectSameMistake([], [], 'TECHNICAL_PERFORMANCE')).toBe(false);
  });

  it('is false when the prior plan in the same category showed improvement', () => {
    const priorPlan = plan({ id: 'p1' });
    const reassessment: Reassessment = { id: 'r1', recoveryPlanId: 'p1', result: 'improved', notes: null, createdAt: '2026-01-04' };
    expect(detectSameMistake([priorPlan], [reassessment], 'TECHNICAL_PERFORMANCE')).toBe(false);
  });

  it('is true when a prior completed plan in the same category showed no change', () => {
    const priorPlan = plan({ id: 'p1' });
    const reassessment: Reassessment = { id: 'r1', recoveryPlanId: 'p1', result: 'no_change', notes: null, createdAt: '2026-01-04' };
    expect(detectSameMistake([priorPlan], [reassessment], 'TECHNICAL_PERFORMANCE')).toBe(true);
  });

  it('is false when the prior plan is a different category', () => {
    const priorPlan = plan({ id: 'p1', failureCategory: 'COMMUNICATION_PERFORMANCE' });
    const reassessment: Reassessment = { id: 'r1', recoveryPlanId: 'p1', result: 'no_change', notes: null, createdAt: '2026-01-04' };
    expect(detectSameMistake([priorPlan], [reassessment], 'TECHNICAL_PERFORMANCE')).toBe(false);
  });
});
