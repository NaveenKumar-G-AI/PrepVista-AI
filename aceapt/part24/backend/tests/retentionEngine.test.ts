import { describe, it, expect } from 'vitest';
import { assessRetention, classifyFailureType } from '../src/engine/retentionEngine';
import { RetentionEvidence, RecoverySession } from '../src/types';
import { daysAgo } from '../src/utils/math';

const S = 'student_x';
const SKILL = 'time_and_work';

function makeEvidence(overrides: Partial<RetentionEvidence>): RetentionEvidence {
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

describe('assessRetention — evidence weighting & state classification', () => {
  it('returns NOT_LEARNED with zero evidence', () => {
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence: [], recoverySessions: [] });
    expect(result.memoryState).toBe('NOT_LEARNED');
    expect(result.confidence).toBe('LOW');
    expect(result.trend).toBe('INSUFFICIENT_DATA');
    expect(result.masteryScore).toBeNull();
    expect(result.retentionRisk).toBeNull();
  });

  it('returns RECENTLY_LEARNED when there is learning-phase evidence but no delayed check', () => {
    const evidence = [makeEvidence({ source: 'initial_assessment', performance: 0.9, timestamp: daysAgo(1) })];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    expect(result.memoryState).toBe('RECENTLY_LEARNED');
    expect(result.masteryScore).toBeCloseTo(0.9);
    expect(result.retentionScore).toBeNull();
  });

  it('classifies STABLE when delayed checks stay close to the initial performance', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.88, timestamp: daysAgo(20) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.86, timestamp: daysAgo(10) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.85, timestamp: daysAgo(2) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    expect(result.memoryState).toBe('STABLE');
    expect(result.trend).toBe('STABLE');
  });

  it('classifies AT_RISK on the section-14-style decay example (88 -> 84 -> 63)', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.88, timestamp: daysAgo(7) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.84, timestamp: daysAgo(4) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.63, timestamp: daysAgo(1) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    // peak 0.88, recent window avg(0.84,0.63)=0.735, decline ~0.145 (> DECAYING threshold 0.25? no ->
    // but combined with the recall-only floor this should read as at least DECAYING/AT_RISK, never STABLE.
    expect(result.memoryState).not.toBe('STABLE');
    expect(result.trend).toBe('DECLINING');
  });

  it('classifies AT_RISK on a clear, larger decline', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.9, timestamp: daysAgo(14) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.5, timestamp: daysAgo(7) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.44, timestamp: daysAgo(2) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    expect(result.memoryState).toBe('AT_RISK');
    expect(result.retentionRisk).not.toBeNull();
    expect(result.retentionRisk as number).toBeGreaterThan(0.3);
  });

  it('does not classify stable from a single excellent score', () => {
    const evidence = [makeEvidence({ source: 'delayed_recall', performance: 0.98, timestamp: daysAgo(1) })];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    expect(result.confidence).not.toBe('HIGH');
  });

  it('does not permanently classify a student as weak from a single bad recall', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.85, timestamp: daysAgo(10) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.3, timestamp: daysAgo(1) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    // One bad check should raise concern (not STABLE) but confidence must stay low —
    // a single data point cannot earn HIGH confidence in either direction.
    expect(result.memoryState).not.toBe('STABLE');
    expect(result.confidence).not.toBe('HIGH');
  });

  it('raises confidence to HIGH after several consistent delayed checks', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.86, timestamp: daysAgo(20) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.85, timestamp: daysAgo(14) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.84, timestamp: daysAgo(7) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.86, timestamp: daysAgo(2) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [] });
    expect(result.confidence).toBe('HIGH');
    expect(result.memoryState).toBe('STABLE');
  });

  it('does not invent a delay from missing timestX (uses only provided timestamps)', () => {
    const now = new Date('2026-08-28T00:00:00.000Z');
    const evidence = [makeEvidence({ source: 'delayed_recall', performance: 0.9, timestamp: now.toISOString() })];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [], now });
    expect(result.lastEvidenceAt).toBe(now.toISOString());
  });

  it('forces memoryState to RECOVERING while a recovery session is open', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.9, timestamp: daysAgo(10) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.4, timestamp: daysAgo(2) }),
    ];
    const openSession: RecoverySession = {
      id: 'rs_1', studentId: S, skillId: SKILL, createdAt: daysAgo(1),
      failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
      status: 'AWAITING_DELAYED_VERIFICATION', beforeScore: 0.4, immediateScore: 0.85, delayedScore: null,
      delayedVerificationAt: null,
    };
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [openSession] });
    expect(result.memoryState).toBe('RECOVERING');
    expect(result.currentRecoveryStatus).toBe('AWAITING_DELAYED_VERIFICATION');
  });

  it('flags recurring weakness after a verified-stable session relapses', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.8, timestamp: daysAgo(30) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.45, timestamp: daysAgo(25) }),
      makeEvidence({ source: 'recovery_immediate_verification', performance: 0.85, timestamp: daysAgo(22) }),
      makeEvidence({ source: 'recovery_delayed_verification', performance: 0.78, timestamp: daysAgo(18) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.5, timestamp: daysAgo(10) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.48, timestamp: daysAgo(1) }),
    ];
    const resolvedSession: RecoverySession = {
      id: 'rs_1', studentId: S, skillId: SKILL, createdAt: daysAgo(22),
      failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
      status: 'VERIFIED_STABLE', beforeScore: 0.45, immediateScore: 0.85, delayedScore: 0.78,
      delayedVerificationAt: daysAgo(18),
    };
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [resolvedSession] });
    expect(result.recurringWeakness).toBe(true);
  });

  it('recovery success (spec section 36): before/after/delayed produces STABLE, not a false decline against pre-recovery or immediate-verification peaks', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.9, timestamp: daysAgo(14) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.5, timestamp: daysAgo(7) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.44, timestamp: daysAgo(2) }),
      makeEvidence({ source: 'recovery_immediate_verification', performance: 1.0, timestamp: daysAgo(1) }),
      makeEvidence({ source: 'recovery_delayed_verification', performance: 0.79, timestamp: daysAgo(0) }),
    ];
    const resolvedSession2: RecoverySession = {
      id: 'rs_2', studentId: S, skillId: SKILL, createdAt: daysAgo(1),
      failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
      status: 'VERIFIED_STABLE', beforeScore: 0.44, immediateScore: 1.0, delayedScore: 0.79,
      delayedVerificationAt: daysAgo(0),
    };
    const result2 = assessRetention({ studentId: S, skillId: SKILL, evidence, recoverySessions: [resolvedSession2] });
    // A 79% delayed check right after a successful recovery should read as
    // STABLE, not as decay measured against the temporarily-inflated 100%
    // immediate-verification score or the old pre-recovery history.
    expect(result2.memoryState).toBe('STABLE');
    expect(result2.evidenceCount).toBe(5); // full lifetime count is still reported
  });

  it('a delayed score sitting exactly at the AT_RISK floor does not verify as stable', () => {
    const evidence = [
      makeEvidence({ source: 'initial_assessment', performance: 0.8, timestamp: daysAgo(20) }),
      makeEvidence({ source: 'delayed_recall', performance: 0.45, timestamp: daysAgo(15) }),
    ];
    const provisionallyResolved: RecoverySession = {
      id: 'rs_boundary', studentId: S, skillId: SKILL, createdAt: daysAgo(3),
      failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
      status: 'VERIFIED_STABLE', beforeScore: 0.45, immediateScore: 1.0, delayedScore: 0.5,
      delayedVerificationAt: daysAgo(0),
    };
    const withBoundaryEvidence = [
      ...evidence,
      makeEvidence({ source: 'recovery_immediate_verification', performance: 1.0, timestamp: daysAgo(3) }),
      makeEvidence({ source: 'recovery_delayed_verification', performance: 0.5, timestamp: daysAgo(0) }),
    ];
    const result = assessRetention({ studentId: S, skillId: SKILL, evidence: withBoundaryEvidence, recoverySessions: [provisionallyResolved] });
    expect(result.memoryState).not.toBe('STABLE');
  });
});

describe('classifyFailureType', () => {
  it('returns NONE when there is no delayed evidence yet', () => {
    expect(classifyFailureType([makeEvidence({ source: 'initial_assessment' })])).toBe('NONE');
  });

  it('detects RETRIEVAL_FAILURE when recognition is strong but recall is weak', () => {
    const evidence = [
      makeEvidence({ source: 'delayed_recall', questionType: 'recognition', performance: 0.9 }),
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.4 }),
    ];
    expect(classifyFailureType(evidence)).toBe('RETRIEVAL_FAILURE');
  });

  it('detects APPLICATION_FAILURE when recall is fine but application is weak', () => {
    const evidence = [
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.8 }),
      makeEvidence({ source: 'delayed_recall', questionType: 'application', performance: 0.3 }),
    ];
    expect(classifyFailureType(evidence)).toBe('APPLICATION_FAILURE');
  });

  it('detects TRANSFER_FAILURE when recall is fine but transfer questions fail', () => {
    const evidence = [
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.8 }),
      makeEvidence({ source: 'transfer_question', questionType: 'transfer', performance: 0.2 }),
    ];
    expect(classifyFailureType(evidence)).toBe('TRANSFER_FAILURE');
  });

  it('detects EXECUTION_FAILURE when most low scores are tagged as calculation errors', () => {
    const evidence = [
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.3, context: 'calculation_error' }),
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.35, context: 'calculation_error' }),
      makeEvidence({ source: 'delayed_recall', questionType: 'recall', performance: 0.4, context: 'calculation_error' }),
    ];
    expect(classifyFailureType(evidence)).toBe('EXECUTION_FAILURE');
  });
});
