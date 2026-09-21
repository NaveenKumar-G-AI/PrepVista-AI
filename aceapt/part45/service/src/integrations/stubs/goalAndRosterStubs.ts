// ---------------------------------------------------------------------------
// STUB ADAPTERS — Feature 44 (goals) and the roster/institution system do
// not exist in this build (no ACEAPT codebase was available to integrate
// against). These stubs return small, static, clearly-fake demo data so the
// priority-signal and cohort endpoints are exercisable end to end. Replace
// with real calls to Feature 44's API and the roster service before
// deploying — see service/README.md.
// ---------------------------------------------------------------------------

import type { GoalContext, GoalEngineAdapter, RosterAdapter } from '../types';

const DEMO_GOAL: GoalContext = {
  goalId: 'demo-goal-placement-readiness',
  label: 'Placement Readiness',
  skillCodes: [
    'QUANT.PROBABILITY',
    'QUANT.COMBINATION',
    'QUANT.PERMUTATION',
    'QUANT.DATA_INTERPRETATION',
    'QUANT.RATIO',
    'QUANT.PERCENTAGES',
    'LOGIC.PUZZLE_REASONING',
    'LOGIC.SEATING_ARRANGEMENT',
    'LOGIC.COMPLEX_ANALYTICAL_REASONING',
    'VERBAL.READING_COMPREHENSION',
    'VERBAL.CRITICAL_REASONING',
  ],
  deadline: null,
};

export const goalEngineStub: GoalEngineAdapter = {
  async getActiveGoal(_studentId) {
    // Every demo student shares one illustrative goal. A real adapter would
    // call Feature 44's API keyed by studentId.
    return DEMO_GOAL;
  },
};

const DEMO_ROSTER: Record<string, string[]> = {
  'demo-institution-1': ['student_demo_1', 'student_demo_2', 'student_demo_3'],
};

export const rosterAdapterStub: RosterAdapter = {
  async getStudentIdsForInstitution(institutionId) {
    return DEMO_ROSTER[institutionId] ?? [];
  },
};
