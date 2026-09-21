import { computeReadiness } from '../readinessEngine';
import { aggregateCapabilityEvidence } from '../capabilityEvidence';
import { CapabilityEvidenceResult, CapabilityRequirement, EvidenceItem } from '../../types/domain';

const NOW = new Date('2026-08-30T00:00:00.000Z');
const WINDOW = 210;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function ev(overrides: Partial<EvidenceItem> & Pick<EvidenceItem, 'sourceType' | 'capabilityId'>): EvidenceItem {
  return {
    id: `ev_${Math.random().toString(36).slice(2, 8)}`,
    studentId: 'student_1',
    occurredAt: daysAgo(30),
    score: null,
    outcome: null,
    context: null,
    validationState: 'UNVALIDATED',
    ...overrides,
  };
}

function manualResult(overrides: Partial<CapabilityEvidenceResult> & Pick<CapabilityEvidenceResult, 'capabilityId'>): CapabilityEvidenceResult {
  return {
    label: 'UNKNOWN',
    achievedClass: null,
    confidence: 'LOW',
    independentSourceCount: 0,
    freshestEvidenceDate: null,
    freshnessState: null,
    hasConflict: false,
    conflictExplanation: null,
    contributingEvidenceIds: [],
    reasons: [],
    ...overrides,
  };
}

describe('computeReadiness — end to end against the brief\'s "Backend Developer" example', () => {
  const requirements: CapabilityRequirement[] = [
    { capabilityId: 'python', capabilityName: 'Python', requiredLevel: 'STRONG', importance: 3 },
    { capabilityId: 'sql', capabilityName: 'SQL', requiredLevel: 'INTERMEDIATE', importance: 3 },
    { capabilityId: 'rest', capabilityName: 'REST APIs', requiredLevel: 'INTERMEDIATE', importance: 3 },
    { capabilityId: 'testing', capabilityName: 'Testing', requiredLevel: 'INTERMEDIATE', importance: 2 },
    { capabilityId: 'system_design', capabilityName: 'System Design', requiredLevel: 'BASIC', importance: 1 },
  ];

  const rawEvidence: EvidenceItem[] = [
    ev({ capabilityId: 'python', sourceType: 'ASSESSMENT', score: 91, occurredAt: daysAgo(70) }),
    ev({ capabilityId: 'python', sourceType: 'PROJECT', outcome: 'COMPLETED', occurredAt: daysAgo(30) }),
    ev({ capabilityId: 'python', sourceType: 'SIMULATION', score: 85, outcome: 'PASSED', occurredAt: daysAgo(15) }),

    ev({ capabilityId: 'sql', sourceType: 'ASSESSMENT', score: 88, occurredAt: daysAgo(60) }),
    ev({ capabilityId: 'sql', sourceType: 'SIMULATION', score: 81, outcome: 'PASSED', occurredAt: daysAgo(25) }),
    ev({ capabilityId: 'sql', sourceType: 'PROJECT', outcome: 'COMPLETED', occurredAt: daysAgo(10) }),

    ev({ capabilityId: 'rest', sourceType: 'TRAINING', occurredAt: daysAgo(90) }),
    ev({ capabilityId: 'rest', sourceType: 'CODING_TEST', score: 65, occurredAt: daysAgo(20) }),

    ev({ capabilityId: 'testing', sourceType: 'SELF_REPORT', claimedLevel: 'INTERMEDIATE', occurredAt: daysAgo(5) }),

    // system_design: intentionally no evidence at all.
  ];

  const evidenceByCapability = new Map(
    requirements.map((r) => [r.capabilityId, aggregateCapabilityEvidence(r.capabilityId, rawEvidence, WINDOW, NOW)])
  );

  const result = computeReadiness(requirements, evidenceByCapability);

  it('produces the exact per-capability picture described in the brief', () => {
    const byId = Object.fromEntries(result.capabilityStatuses.map((s) => [s.capabilityId, s]));
    expect(byId.python.label).toBe('STRONG');
    expect(byId.sql.label).toBe('STRONG');
    expect(byId.rest.label).toBe('DEVELOPING');
    expect(byId.testing.label).toBe('LIMITED');
    expect(byId.system_design.label).toBe('UNKNOWN');
  });

  it('reaches READY_TO_TEST once every core capability meets its bar, even with secondary gaps open', () => {
    expect(result.state).toBe('READY_TO_TEST');
  });

  it('ranks Testing as the top gap over System Design, because it carries more importance', () => {
    expect(result.topGap?.capabilityId).toBe('testing');
  });

  it('lists System Design as a remaining (lower-priority) gap', () => {
    expect(result.gaps.map((g) => g.capabilityId)).toContain('system_design');
  });
});

describe('computeReadiness — state machine edge cases', () => {
  const requirements: CapabilityRequirement[] = [
    { capabilityId: 'a', capabilityName: 'A', requiredLevel: 'INTERMEDIATE', importance: 3 },
    { capabilityId: 'b', capabilityName: 'B', requiredLevel: 'INTERMEDIATE', importance: 3 },
    { capabilityId: 'c', capabilityName: 'C', requiredLevel: 'BASIC', importance: 1 },
  ];

  it('is UNKNOWN when there is no evidence anywhere', () => {
    const map = new Map<string, CapabilityEvidenceResult>();
    const result = computeReadiness(requirements, map);
    expect(result.state).toBe('UNKNOWN');
  });

  it('is EXPLORING when only a sliver of requirements have any evidence', () => {
    const map = new Map<string, CapabilityEvidenceResult>([
      ['a', manualResult({ capabilityId: 'a', label: 'LIMITED', achievedClass: 'SELF_REPORTED' })],
    ]);
    const result = computeReadiness(requirements, map);
    expect(result.state).toBe('EXPLORING');
  });

  it('is STRONG_EVIDENCE only when every requirement, including secondary ones, is strongly met', () => {
    const map = new Map<string, CapabilityEvidenceResult>([
      ['a', manualResult({ capabilityId: 'a', label: 'STRONG', achievedClass: 'VALIDATED', independentSourceCount: 3 })],
      ['b', manualResult({ capabilityId: 'b', label: 'STRONG', achievedClass: 'VALIDATED', independentSourceCount: 3 })],
      ['c', manualResult({ capabilityId: 'c', label: 'STRONG', achievedClass: 'DEMONSTRATED', independentSourceCount: 2 })],
    ]);
    const result = computeReadiness(requirements, map);
    expect(result.state).toBe('STRONG_EVIDENCE');
    expect(result.confidence).toBe('HIGH');
  });

  it('keeps confidence LOW even in a ready state if a core capability has an unresolved conflict', () => {
    const map = new Map<string, CapabilityEvidenceResult>([
      ['a', manualResult({ capabilityId: 'a', label: 'DEVELOPING', achievedClass: 'PRACTICE', independentSourceCount: 2, hasConflict: true })],
      ['b', manualResult({ capabilityId: 'b', label: 'STRONG', achievedClass: 'VALIDATED', independentSourceCount: 3 })],
      ['c', manualResult({ capabilityId: 'c', label: 'STRONG', achievedClass: 'DEMONSTRATED', independentSourceCount: 2 })],
    ]);
    const result = computeReadiness(requirements, map);
    // 'a' has a conflict, so it can never "meet" its requirement -> core not fully met -> not READY_TO_TEST.
    expect(result.state).not.toBe('READY_TO_TEST');
    expect(result.confidence).toBe('LOW');
  });
});
