import { describe, it, expect } from 'vitest';
import { scoreCandidates, rankCandidates } from '../src/engine/ranking';
import { detectLearningProblems } from '../src/engine/problemDetection';
import { generateCandidates } from '../src/engine/candidateGeneration';
import { SEED_STUDENTS } from '../src/data/seed';
import { InterventionProfile } from '../src/domain/types';

describe('ranking', () => {
  it('ranks TIMED_DRILL above MICRO_ASSESSMENT for a detected SPEED_GAP', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;
    const problem = detectLearningProblems(state).find(p => p.category === 'SPEED_GAP')!;
    const candidates = generateCandidates(problem);
    const ranked = rankCandidates(scoreCandidates(candidates, problem, state, null));
    expect(ranked[0].type).toBe('TIMED_DRILL');
  });

  it('flags COLD_START when there is no profile history for a candidate type', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;
    const problem = detectLearningProblems(state).find(p => p.category === 'SPEED_GAP')!;
    const candidates = generateCandidates(problem);
    const scored = scoreCandidates(candidates, problem, state, null);
    expect(scored.every(c => c.flags.includes('COLD_START'))).toBe(true);
  });

  it('scores a NON_RESPONSE_RISK-flagged candidate lower than the same candidate with no history', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;
    const problem = detectLearningProblems(state).find(p => p.category === 'SPEED_GAP')!;
    const candidates = generateCandidates(problem);

    const badProfile: InterventionProfile = {
      studentId: state.studentId,
      entries: [
        {
          type: 'TIMED_DRILL',
          attempts: 3,
          successes: 0,
          avgImmediateDeltaPct: -2,
          retentionChecks: 0,
          avgRetentionDeltaPct: null,
          responseLabel: 'LOW',
          nonResponseFlag: true,
          saturationFlag: false
        }
      ],
      updatedAt: new Date().toISOString()
    };

    const cleanScore = rankCandidates(scoreCandidates(candidates, problem, state, null)).find(c => c.type === 'TIMED_DRILL')!.score;
    const flagged = scoreCandidates(candidates, problem, state, badProfile).find(c => c.type === 'TIMED_DRILL')!;

    expect(flagged.flags).toContain('NON_RESPONSE_RISK');
    expect(flagged.score).toBeLessThan(cleanScore);
  });

  it('shifts preference toward the shorter candidate for a student with SHORT_SESSION_PREFERENCE (Section 32: Feature 11 integration)', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_205')!;
    const problem = detectLearningProblems(state).find(p => p.category === 'CONCEPT_GAP')!;
    const candidates = generateCandidates(problem);

    const withoutPreference = rankCandidates(scoreCandidates(candidates, problem, state, null));
    const shortSessionState = { ...state, behaviorProfile: [{ code: 'SHORT_SESSION_PREFERENCE' as const, detail: 'test' }] };
    const withPreference = rankCandidates(scoreCandidates(candidates, problem, shortSessionState, null));

    const conceptReteachWithout = withoutPreference.find(c => c.type === 'CONCEPT_RETEACH')!.scoreBreakdown.studentFit;
    const conceptReteachWith = withPreference.find(c => c.type === 'CONCEPT_RETEACH')!.scoreBreakdown.studentFit;
    const workedExampleWith = withPreference.find(c => c.type === 'WORKED_EXAMPLE')!.scoreBreakdown.studentFit;

    expect(conceptReteachWith).toBeLessThan(conceptReteachWithout); // 15min penalised once the flag is set
    expect(workedExampleWith).toBeGreaterThan(conceptReteachWith); // 6min favoured over 15min
  });
});
