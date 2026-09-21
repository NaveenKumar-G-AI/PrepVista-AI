import { describe, it, expect } from 'vitest';
import { detectLearningProblems } from '../src/engine/problemDetection';
import { SEED_STUDENTS } from '../src/data/seed';
import { StudentState } from '../src/domain/types';

describe('detectLearningProblems', () => {
  it('detects a SPEED_GAP for student_102 in Probability, with baseline matching the weak timed average', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;
    const problems = detectLearningProblems(state);
    const speed = problems.find(p => p.category === 'SPEED_GAP' && p.topic === 'Probability');
    expect(speed).toBeDefined();
    expect(speed!.confidence).toBeGreaterThan(0);
    expect(speed!.evidence.length).toBeGreaterThan(0);
    expect(speed!.baselineAccuracyPct).toBeCloseTo(59, 0); // (61 + 57) / 2
  });

  it('does not flag a problem for balanced Percentages performance (student_102 has too little data per mode)', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;
    const problems = detectLearningProblems(state);
    expect(problems.find(p => p.topic === 'Percentages')).toBeUndefined();
  });

  it('detects a CONCEPT_GAP for student_205 in Percentages, not a SPEED_GAP', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_205')!;
    const problems = detectLearningProblems(state);
    const percentagesProblems = problems.filter(p => p.topic === 'Percentages');
    expect(percentagesProblems).toHaveLength(1);
    expect(percentagesProblems[0].category).toBe('CONCEPT_GAP');
  });

  it('does not flag a problem for balanced Data Interpretation performance (student_205)', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_205')!;
    const problems = detectLearningProblems(state);
    expect(problems.find(p => p.topic === 'Data Interpretation')).toBeUndefined();
  });

  it('returns no problems for a brand new student with no performance data', () => {
    const empty: StudentState = {
      studentId: 'new_student',
      generatedAt: new Date().toISOString(),
      recentPerformance: [],
      behaviorProfile: 'unavailable',
      persistence: 'unavailable',
      consistency: 'unavailable',
      availableStudyMinutes: 'unavailable',
      assessmentDeadline: 'unavailable',
      readiness: 'unavailable',
      interventionHistory: [],
      retentionSignals: 'unavailable',
      transferSignals: 'unavailable'
    };
    expect(detectLearningProblems(empty)).toEqual([]);
  });
});
