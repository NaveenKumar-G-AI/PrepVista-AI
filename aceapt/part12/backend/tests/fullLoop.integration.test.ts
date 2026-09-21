import { describe, it, expect } from 'vitest';
import { detectLearningProblems } from '../src/engine/problemDetection';
import { decideAllInterventions } from '../src/engine/decision';
import { startExecution, completeExecution } from '../src/engine/execution';
import { computeImmediateOutcome } from '../src/engine/outcome';
import { recordAttempt } from '../src/engine/profile';
import { SEED_STUDENTS } from '../src/data/seed';

describe('full intervention loop (student_102 — the spec Section 72 demo story)', () => {
  it('goes from raw performance data to a TIMED_DRILL decision, execution, and an updated profile', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_102')!;

    // OBSERVE + IDENTIFY LEARNING PROBLEM
    const problems = detectLearningProblems(state);
    expect(problems.length).toBeGreaterThan(0);

    // GENERATE CANDIDATES + RANK + SELECT
    const decisions = decideAllInterventions(problems, state, null);
    expect(decisions.length).toBeGreaterThan(0);
    const top = decisions[0];
    expect(top.selected.type).toBe('TIMED_DRILL');
    expect(top.problem.baselineAccuracyPct).toBeCloseTo(59, 0);

    // EXECUTE INTERVENTION
    const execution = startExecution(top);
    expect(execution.status).toBe('IN_PROGRESS');
    expect(execution.contract.topic).toBe('Probability');
    expect(execution.contract.timeLimitSec).toBe(12 * 60);

    const completed = completeExecution(execution, { accuracyPct: 74, questionsCompleted: 10 });
    expect(completed.status).toBe('COMPLETED');

    // MEASURE RESPONSE
    const outcome = computeImmediateOutcome(completed, top.problem.baselineAccuracyPct);
    expect(outcome.immediateEffectiveness).toBe('SUCCESSFUL');

    // UPDATE INTERVENTION PROFILE
    const profile = recordAttempt(null, state.studentId, 'TIMED_DRILL', outcome, [outcome]);
    const entry = profile.entries.find(e => e.type === 'TIMED_DRILL')!;
    expect(entry.attempts).toBe(1);
    expect(entry.successes).toBe(1);
    expect(entry.avgImmediateDeltaPct).toBeCloseTo(74 - 59, 0);
  });

  it('produces a different problem and a different intervention for student_205 from the same engine', () => {
    const state = SEED_STUDENTS.find(s => s.studentId === 'student_205')!;
    const problems = detectLearningProblems(state);
    const decisions = decideAllInterventions(problems, state, null);
    const top = decisions[0];
    expect(top.problem.category).toBe('CONCEPT_GAP');
    expect(top.selected.type).toBe('CONCEPT_RETEACH');
  });
});
