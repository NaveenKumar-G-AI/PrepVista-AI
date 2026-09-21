import { describe, it, expect } from 'vitest';
import { deriveState } from '../src/engine/state.js';
import { computeTrend } from '../src/engine/trend.js';
import { computeRetention, computeTransferConfidence } from '../src/engine/transferRetention.js';
import { aggregateEvidence } from '../src/engine/aggregate.js';
import { computeConfidence } from '../src/engine/confidence.js';
import { AssessmentTier, EvidenceStatus, EvidenceType, SkillState, Trend, type NormalizedEvidence, type SkillSignalHistoryPoint } from '../src/domain/models.js';

const NOW = '2026-08-20T00:00:00.000Z';
const STUDENT = '11111111-1111-1111-1111-111111111111';

function daysAgo(n: number): string {
  return new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeEvidence(overrides: Partial<NormalizedEvidence>): NormalizedEvidence {
  return {
    evidenceId: Math.random().toString(36),
    sourceType: EvidenceType.CORRECTNESS_RESULT,
    sourceId: 'x',
    studentId: STUDENT,
    skillId: 'algorithms',
    rawValue: {},
    normalizedValue: 0.9,
    status: EvidenceStatus.VALID,
    difficulty: 0.6,
    contextGroup: 'default',
    assessmentTier: AssessmentTier.PRACTICE,
    sourceReliability: 0.9,
    independence: 1,
    isTransfer: false,
    occurredAt: daysAgo(1),
    evidenceVersion: 1,
    policyVersion: 'signal-policy-v1',
    ...overrides,
  };
}

/** Builds a MASTERED baseline: strong, diverse, confident, established history.
 * 12 distinct-context points is what the confidence formula actually needs to clear
 * the mastery bar (countFactor ~0.86 at n=12, diversityFactor=1.0, reliability=0.9). */
function masteredBaseline(): NormalizedEvidence[] {
  return Array.from({ length: 12 }, (_, i) => makeEvidence({ normalizedValue: 0.92, contextGroup: `ctx-${i}`, occurredAt: daysAgo(40 + i * 3) }));
}

describe('state machine (req #19/#20/#38/#39)', () => {
  it('one non-authoritative recent failure does NOT destroy established mastery — moves to AT_RISK, not straight to REGRESSING or DEVELOPING', () => {
    const historical = masteredBaseline();
    const agg0 = aggregateEvidence(historical, STUDENT, 'algorithms', NOW);
    const conf0 = computeConfidence(agg0);
    const masteredState = deriveState({ previousState: SkillState.UNKNOWN, agg: agg0, confidence: conf0, recentEvidence: [] });
    expect(masteredState).toBe(SkillState.MASTERED);

    const oneRecentFailure = [...historical, makeEvidence({ normalizedValue: 0.1, contextGroup: 'recent-fail', occurredAt: daysAgo(2) })];
    const agg1 = aggregateEvidence(oneRecentFailure, STUDENT, 'algorithms', NOW);
    const conf1 = computeConfidence(agg1);
    const recent = oneRecentFailure.filter((e) => (Date.parse(NOW) - Date.parse(e.occurredAt)) / 86400000 <= 21);
    const nextState = deriveState({ previousState: masteredState, agg: agg1, confidence: conf1, recentEvidence: recent });

    expect(nextState).not.toBe(SkillState.REGRESSING);
    expect(nextState).not.toBe(SkillState.DEVELOPING);
    expect(nextState).toBe(SkillState.AT_RISK);
  });

  it('sustained recent low performance DOES escalate to REGRESSING (req #20)', () => {
    const historical = masteredBaseline();
    const sustainedFailures = [
      ...historical,
      makeEvidence({ normalizedValue: 0.1, contextGroup: 'r1', occurredAt: daysAgo(5) }),
      makeEvidence({ normalizedValue: 0.15, contextGroup: 'r2', occurredAt: daysAgo(3) }),
      makeEvidence({ normalizedValue: 0.1, contextGroup: 'r3', occurredAt: daysAgo(1) }),
    ];
    const agg = aggregateEvidence(sustainedFailures, STUDENT, 'algorithms', NOW);
    const confidence = computeConfidence(agg);
    const recent = sustainedFailures.filter((e) => (Date.parse(NOW) - Date.parse(e.occurredAt)) / 86400000 <= 21);
    const state = deriveState({ previousState: SkillState.MASTERED, agg, confidence, recentEvidence: recent });
    expect(state).toBe(SkillState.REGRESSING);
  });

  it('a single authoritative (ASSESSMENT-tier) contradicting result escalates straight to REGRESSING', () => {
    const historical = masteredBaseline();
    const withAuthoritativeFailure = [...historical, makeEvidence({ normalizedValue: 0.1, contextGroup: 'exam', assessmentTier: AssessmentTier.ASSESSMENT, occurredAt: daysAgo(1) })];
    const agg = aggregateEvidence(withAuthoritativeFailure, STUDENT, 'algorithms', NOW);
    const confidence = computeConfidence(agg);
    const recent = withAuthoritativeFailure.filter((e) => (Date.parse(NOW) - Date.parse(e.occurredAt)) / 86400000 <= 21);
    const state = deriveState({ previousState: SkillState.MASTERED, agg, confidence, recentEvidence: recent });
    expect(state).toBe(SkillState.REGRESSING);
  });

  it('one success does NOT create false mastery (req #39 inverse / #38)', () => {
    const evidence = [makeEvidence({ normalizedValue: 1, contextGroup: 'only-one' })];
    const agg = aggregateEvidence(evidence, STUDENT, 'algorithms', NOW);
    const confidence = computeConfidence(agg);
    const state = deriveState({ previousState: SkillState.UNKNOWN, agg, confidence, recentEvidence: evidence });
    expect(state).not.toBe(SkillState.MASTERED);
  });

  it('high signal with low confidence/diversity caps at PROFICIENT, never MASTERED (req #38)', () => {
    // ten IDENTICAL-context high scores: signal is high but diversity is capped at one context
    const evidence = Array.from({ length: 10 }, () => makeEvidence({ normalizedValue: 0.95, contextGroup: 'memorized-one-pattern' }));
    const agg = aggregateEvidence(evidence, STUDENT, 'algorithms', NOW);
    expect(agg.weightedSignal).toBeGreaterThan(0.85);
    const confidence = computeConfidence(agg);
    const state = deriveState({ previousState: SkillState.UNKNOWN, agg, confidence, recentEvidence: evidence });
    expect(state).toBe(SkillState.PROFICIENT);
  });

  it('very low confidence forces UNCERTAIN regardless of signal (req #21/#40)', () => {
    const evidence = [makeEvidence({ normalizedValue: 0.9, sourceReliability: 0.1 })];
    const agg = aggregateEvidence(evidence, STUDENT, 'algorithms', NOW);
    const confidence = computeConfidence(agg);
    const state = deriveState({ previousState: SkillState.UNKNOWN, agg, confidence, recentEvidence: evidence });
    expect(state).toBe(SkillState.UNCERTAIN);
  });

  it('contradiction with no established mastery to protect resolves to UNCERTAIN, not an invented verdict (req #22/#40)', () => {
    const historical = [
      makeEvidence({ normalizedValue: 0.85, contextGroup: 'h1', occurredAt: daysAgo(60) }),
      makeEvidence({ normalizedValue: 0.8, contextGroup: 'h2', occurredAt: daysAgo(55) }),
    ];
    const recentContradicting = [makeEvidence({ normalizedValue: 0.05, contextGroup: 'r1', occurredAt: daysAgo(2) })];
    const evidence = [...historical, ...recentContradicting];
    const agg = aggregateEvidence(evidence, STUDENT, 'algorithms', NOW);
    const confidence = computeConfidence(agg);
    // previousState was only DEVELOPING/PRACTICED-ish, not an established mastery state
    const state = deriveState({ previousState: SkillState.DEVELOPING, agg, confidence, recentEvidence: recentContradicting });
    expect(state).toBe(SkillState.UNCERTAIN);
  });
});

describe('trend + volatility (req #26/#27/#28)', () => {
  const point = (signal: number, i: number): SkillSignalHistoryPoint => ({
    skillId: 'algorithms',
    studentId: STUDENT,
    signal,
    confidence: 0.7,
    state: SkillState.PRACTICED,
    trend: Trend.STABLE,
    recordedAt: daysAgo(20 - i),
    policyVersion: 'signal-policy-v1',
  });

  it('too few points -> INSUFFICIENT_DATA', () => {
    const result = computeTrend([point(0.5, 0), point(0.5, 1)]);
    expect(result.trend).toBe(Trend.INSUFFICIENT_DATA);
  });

  it('steadily rising sequence -> IMPROVING (req #27 example: 0.42 -> 0.49 -> 0.58 -> 0.67)', () => {
    const seq = [0.42, 0.49, 0.58, 0.67].map(point);
    expect(computeTrend(seq).trend).toBe(Trend.IMPROVING);
  });

  it('steadily falling sequence -> DECLINING', () => {
    const seq = [0.7, 0.6, 0.5, 0.4].map(point);
    expect(computeTrend(seq).trend).toBe(Trend.DECLINING);
  });

  it('flat sequence -> STABLE', () => {
    const seq = [0.6, 0.61, 0.59, 0.6].map(point);
    expect(computeTrend(seq).trend).toBe(Trend.STABLE);
  });

  it('a tiny bump (0.70 -> 0.72) is noise, not IMPROVING (req #27)', () => {
    const seq = [0.7, 0.71, 0.7, 0.72].map(point);
    expect(computeTrend(seq).trend).not.toBe(Trend.IMPROVING);
  });

  it('wildly swinging sequence -> VOLATILE, takes priority over slope (req #28: "strong but unstable" not "weak")', () => {
    const seq = [0.81, 0.44, 0.79, 0.38, 0.82].map(point);
    const result = computeTrend(seq);
    expect(result.trend).toBe(Trend.VOLATILE);
  });
});

describe('transfer confidence (req #17/#30)', () => {
  it('no transfer-tagged evidence -> 0, meaning "untested", not a penalty masquerading as failure', () => {
    const evidence = Array.from({ length: 5 }, (_, i) => makeEvidence({ contextGroup: `c-${i}`, isTransfer: false }));
    const agg = aggregateEvidence(evidence, STUDENT, 'algorithms', NOW);
    expect(computeTransferConfidence(agg)).toBe(0);
  });

  it('a failed transfer challenge keeps transfer confidence low even if the base skill is strong', () => {
    const base = Array.from({ length: 5 }, (_, i) => makeEvidence({ normalizedValue: 0.9, contextGroup: `c-${i}` }));
    const failedTransfer = [makeEvidence({ normalizedValue: 0, contextGroup: 'transfer-attempt', isTransfer: true, sourceType: EvidenceType.TRANSFER_RESULT })];
    const agg = aggregateEvidence([...base, ...failedTransfer], STUDENT, 'algorithms', NOW);
    expect(agg.weightedSignal).toBeGreaterThan(0.6); // base skill still reads strong
    expect(computeTransferConfidence(agg)).toBeLessThan(0.3); // but transfer specifically is low
  });
});

describe('retention (req #29)', () => {
  it('no gap in the evidence timeline -> null (not enough data to assess retention)', () => {
    const evidence = Array.from({ length: 3 }, (_, i) => makeEvidence({ occurredAt: daysAgo(5 - i) }));
    expect(computeRetention(evidence)).toBeNull();
  });

  it('a long silence followed by a successful recheck reads as strong retention', () => {
    const evidence = [
      makeEvidence({ normalizedValue: 0.9, occurredAt: daysAgo(100) }),
      makeEvidence({ normalizedValue: 0.85, occurredAt: daysAgo(95) }),
      makeEvidence({ normalizedValue: 0.9, occurredAt: daysAgo(2) }), // recheck after a long gap
    ];
    expect(computeRetention(evidence)!).toBeGreaterThan(0.8);
  });

  it('a long silence followed by a failed recheck reads as weak retention', () => {
    const evidence = [
      makeEvidence({ normalizedValue: 0.9, occurredAt: daysAgo(100) }),
      makeEvidence({ normalizedValue: 0.1, occurredAt: daysAgo(2) }), // recheck after a long gap
    ];
    expect(computeRetention(evidence)!).toBeLessThan(0.3);
  });
});
