import { aggregateCapabilityEvidence } from '../capabilityEvidence';
import { EvidenceItem } from '../../types/domain';

const NOW = new Date('2026-08-30T00:00:00.000Z');
const WINDOW = 210; // days

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function evidence(overrides: Partial<EvidenceItem> & Pick<EvidenceItem, 'sourceType'>): EvidenceItem {
  return {
    id: `ev_${Math.random().toString(36).slice(2, 8)}`,
    studentId: 'student_1',
    capabilityId: 'cap_python',
    occurredAt: daysAgo(30),
    score: null,
    outcome: null,
    context: null,
    validationState: 'UNVALIDATED',
    ...overrides,
  };
}

describe('aggregateCapabilityEvidence', () => {
  it('returns UNKNOWN with no evidence at all', () => {
    const result = aggregateCapabilityEvidence('cap_python', [], WINDOW, NOW);
    expect(result.label).toBe('UNKNOWN');
    expect(result.achievedClass).toBeNull();
    expect(result.confidence).toBe('LOW');
    expect(result.reasons[0]).toMatch(/no evidence/i);
  });

  it('treats a lone self-report as LIMITED, low confidence', () => {
    const items = [evidence({ sourceType: 'SELF_REPORT', claimedLevel: 'STRONG' })];
    const result = aggregateCapabilityEvidence('cap_python', items, WINDOW, NOW);
    expect(result.label).toBe('LIMITED');
    expect(result.confidence).toBe('LOW');
    expect(result.independentSourceCount).toBe(1);
  });

  it('recognizes strong, corroborated evidence as STRONG with HIGH confidence', () => {
    // Mirrors the worked example in the brief: assessment 88%, simulation 81%, project completed.
    const items = [
      evidence({ id: 'e1', capabilityId: 'cap_sql', sourceType: 'ASSESSMENT', score: 88, occurredAt: daysAgo(60) }),
      evidence({ id: 'e2', capabilityId: 'cap_sql', sourceType: 'SIMULATION', score: 81, outcome: 'PASSED', occurredAt: daysAgo(30) }),
      evidence({ id: 'e3', capabilityId: 'cap_sql', sourceType: 'PROJECT', outcome: 'COMPLETED', occurredAt: daysAgo(10) }),
    ];
    const result = aggregateCapabilityEvidence('cap_sql', items, WINDOW, NOW);
    expect(result.label).toBe('STRONG');
    expect(result.achievedClass).toBe('DEMONSTRATED');
    expect(result.confidence).toBe('HIGH');
    expect(result.independentSourceCount).toBe(3);
    expect(result.hasConflict).toBe(false);
  });

  it('flags a conflict when theory is much stronger than practice, and caps the label', () => {
    const items = [
      evidence({ id: 'e1', capabilityId: 'cap_sql', sourceType: 'ASSESSMENT', score: 95, occurredAt: daysAgo(20) }),
      evidence({ id: 'e2', capabilityId: 'cap_sql', sourceType: 'SIMULATION', score: 48, occurredAt: daysAgo(10) }),
    ];
    const result = aggregateCapabilityEvidence('cap_sql', items, WINDOW, NOW);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictExplanation).toMatch(/theoretical performance/i);
    expect(result.conflictExplanation).toMatch(/practical performance/i);
    expect(result.label).toBe('DEVELOPING'); // never STRONG while unresolved
    expect(result.confidence).toBe('LOW');
  });

  it('does not let a failed practical attempt count as proof of the capability', () => {
    const items = [evidence({ sourceType: 'CODING_TEST', score: 22, outcome: 'FAILED' })];
    const result = aggregateCapabilityEvidence('cap_python', items, WINDOW, NOW);
    // PRACTICE shifted down 2 classes -> ACTIVITY, which maps to DEVELOPING, not STRONG.
    expect(result.achievedClass).toBe('ACTIVITY');
    expect(result.label).toBe('DEVELOPING');
  });

  it('upgrades a strong, passed simulation to DEMONSTRATED rather than leaving it at PRACTICE', () => {
    const items = [evidence({ sourceType: 'SIMULATION', score: 92, outcome: 'PASSED' })];
    const result = aggregateCapabilityEvidence('cap_python', items, WINDOW, NOW);
    expect(result.achievedClass).toBe('DEMONSTRATED');
    expect(result.label).toBe('STRONG');
  });

  it('flags long-stale evidence as needing revalidation while still surfacing a result', () => {
    const items = [evidence({ sourceType: 'ASSESSMENT', score: 90, occurredAt: daysAgo(500) })];
    const result = aggregateCapabilityEvidence('cap_python', items, WINDOW, NOW);
    expect(result.freshnessState).toBe('REVALIDATION_RECOMMENDED');
    expect(result.confidence).toBe('LOW');
  });

  it('never reports a source count higher than the number of distinct source types actually present', () => {
    const items = [
      evidence({ id: 'e1', sourceType: 'ASSESSMENT', score: 70, occurredAt: daysAgo(40) }),
      evidence({ id: 'e2', sourceType: 'ASSESSMENT', score: 75, occurredAt: daysAgo(20) }),
    ];
    const result = aggregateCapabilityEvidence('cap_python', items, WINDOW, NOW);
    expect(result.independentSourceCount).toBe(1);
  });
});
