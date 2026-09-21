import { describe, it, expect } from 'vitest';
import { assessRetention } from '../src/engine/retentionEngine';
import { computeMemoryPriorities } from '../src/engine/priorityEngine';
import { daysAgo } from '../src/utils/math';
import { RetentionEvidence } from '../src/types';

const S = 'student_edge';
const SKILL = 'some_skill';

function ev(overrides: Partial<RetentionEvidence>): RetentionEvidence {
  return {
    id: `ev_${Math.random()}`,
    studentId: S,
    skillId: SKILL,
    timestamp: new Date().toISOString(),
    source: 'delayed_recall',
    difficulty: 'medium',
    questionType: 'recall',
    performance: 0.8,
    ...overrides,
  };
}

describe('edge cases (spec section 63)', () => {
  it('new student with no history reports insufficient evidence, not a fabricated score', () => {
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence: [], recoverySessions: [] });
    expect(result.memoryState).toBe('NOT_LEARNED');
    expect(result.masteryScore).toBeNull();
    expect(result.retentionScore).toBeNull();
    expect(result.retentionRisk).toBeNull();
  });

  it('missing evidence is never silently converted to a zero score', () => {
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence: [], recoverySessions: [] });
    // masteryScore/retentionScore must be null (unknown), never 0 (known-bad).
    expect(result.masteryScore).not.toBe(0);
    expect(result.retentionScore).not.toBe(0);
  });

  it('a missing timestamp is never invented — the engine only uses timestamps it was given', () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z');
    const evidence = [ev({ timestamp: '2025-12-25T00:00:00.000Z' })];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [], now: fixedNow });
    expect(result.lastEvidenceAt).toBe('2025-12-25T00:00:00.000Z');
  });

  it('changing target importance recalculates priority ranking without touching the underlying risk data', () => {
    const assessments = [
      { ...baseAssessment('a', 'Skill A'), retentionRisk: 0.4 },
      { ...baseAssessment('b', 'Skill B'), retentionRisk: 0.4 },
    ];
    const before = computeMemoryPriorities({ assessments, targetImportanceBySkill: { a: 0.9, b: 0.2 } });
    expect(before.priorities[0].skillId).toBe('a');

    // Target changes: b is now the critical one.
    const after = computeMemoryPriorities({ assessments, targetImportanceBySkill: { a: 0.2, b: 0.9 } });
    expect(after.priorities[0].skillId).toBe('b');
  });

  it('a student with many weak concepts gets a capped, prioritized list rather than being overwhelmed', () => {
    const many = Array.from({ length: 17 }, (_, i) => baseAssessment(`skill_${i}`, `Skill ${i}`));
    const result = computeMemoryPriorities({ assessments: many, targetImportanceBySkill: {}, workloadCap: 3 });
    expect(result.totalNeedingAttention).toBe(17);
    expect(result.priorities.length).toBe(3);
  });

  it('stable delayed performance increases confidence over successive checks', () => {
    const two = assessRetention({
      studentId: S,
      skillId: SKILL,
      evidence: [
        ev({ source: 'initial_assessment', performance: 0.85, timestamp: daysAgo(14) }),
        ev({ source: 'delayed_recall', performance: 0.85, timestamp: daysAgo(7) }),
        ev({ source: 'delayed_recall', performance: 0.84, timestamp: daysAgo(2) }),
      ],
      recoverySessions: [],
    });
    const three = assessRetention({
      studentId: S,
      skillId: SKILL,
      evidence: [
        ev({ source: 'initial_assessment', performance: 0.85, timestamp: daysAgo(21) }),
        ev({ source: 'delayed_recall', performance: 0.84, timestamp: daysAgo(14) }),
        ev({ source: 'delayed_recall', performance: 0.85, timestamp: daysAgo(7) }),
        ev({ source: 'delayed_recall', performance: 0.83, timestamp: daysAgo(2) }),
      ],
      recoverySessions: [],
    });
    expect(two.confidence).toBe('MEDIUM');
    expect(three.confidence).toBe('HIGH');
  });

  it('immediate improvement plus a failed delayed check is not marked stable', () => {
    const result = assessRetention({
      studentId: S,
      skillId: SKILL,
      evidence: [
        ev({ source: 'initial_assessment', performance: 0.5, timestamp: daysAgo(10) }),
        ev({ source: 'recovery_immediate_verification', performance: 0.9, timestamp: daysAgo(6) }),
        ev({ source: 'recovery_delayed_verification', performance: 0.4, timestamp: daysAgo(2) }),
      ],
      recoverySessions: [],
    });
    expect(result.memoryState).not.toBe('STABLE');
  });
});

function baseAssessment(skillId: string, skillName: string) {
  return {
    studentId: S,
    skillId,
    skillName,
    masteryScore: 0.7,
    retentionScore: 0.5,
    memoryState: 'AT_RISK' as const,
    confidence: 'MEDIUM' as const,
    retentionRisk: 0.4,
    trend: 'DECLINING' as const,
    recurringWeakness: false,
    escalationLevel: 0,
    lastEvidenceAt: new Date().toISOString(),
    evidenceCount: 3,
    delayedEvidenceCount: 2,
    currentRecoveryStatus: null,
    explanationKey: 'AT_RISK',
  };
}
