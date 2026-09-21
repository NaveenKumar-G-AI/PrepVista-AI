import { InMemoryRecallRepository, nextId } from './repository';
import { RetentionEvidence, RecoverySession, SkillMeta, StudentTarget } from '../types';
import { daysAgo } from '../utils/math';

export const DEMO_STUDENT_ID = 'student_demo_1';

const SKILLS: SkillMeta[] = [
  { id: 'percentages', name: 'Percentages', category: 'Arithmetic' },
  { id: 'ratio_proportion', name: 'Ratio & Proportion', category: 'Arithmetic' },
  { id: 'averages', name: 'Averages', category: 'Arithmetic' },
  { id: 'probability', name: 'Probability', category: 'Modern Math' },
  { id: 'permutation_combination', name: 'Permutation & Combination', category: 'Modern Math' },
  { id: 'time_and_work', name: 'Time & Work', category: 'Arithmetic' },
  { id: 'data_interpretation', name: 'Data Interpretation', category: 'DI/LR' },
  { id: 'logical_reasoning', name: 'Logical Reasoning', category: 'DI/LR' },
];

function ev(partial: Omit<RetentionEvidence, 'id'>): RetentionEvidence {
  return { id: nextId('ev'), ...partial };
}

/**
 * Every number below is deliberately hand-authored to tell a specific,
 * legible story (spec section 51's "wow moment" + section 9's memory
 * profile categories) — it stands in for a real student's history, which
 * doesn't exist yet in this standalone slice. It is clearly demo/seed
 * data, not a claim about any real learner, and every downstream number
 * the UI shows (mastery %, retention %, risk, confidence) is COMPUTED from
 * it by the engine, not hardcoded — see retentionEngine.ts.
 */
export function seedDemoData(repo: InMemoryRecallRepository) {
  SKILLS.forEach((s) => repo._registerSkill(s));

  const target: StudentTarget = {
    studentId: DEMO_STUDENT_ID,
    name: 'Product-Based Company Placement Prep',
    skillImportance: {
      time_and_work: 0.9,
      probability: 0.8,
      permutation_combination: 0.7,
      percentages: 0.6,
      ratio_proportion: 0.5,
      averages: 0.5,
      data_interpretation: 0.85,
      logical_reasoning: 0.8,
    },
    upcomingAssessmentInDays: 5,
    criticalSkillIds: ['time_and_work', 'probability', 'data_interpretation'],
  };
  repo._setTarget(target);

  const S = DEMO_STUDENT_ID;

  // ---------------------------------------------------------------
  // TIME & WORK — the hero skill (spec section 51). Learned well, then
  // declined on two delayed checks. No recovery attempted yet: this is
  // a fresh AT_RISK case, ready for a live, interactive recovery.
  // ---------------------------------------------------------------
  [
    ev({ studentId: S, skillId: 'time_and_work', timestamp: daysAgo(14), source: 'initial_assessment', difficulty: 'medium', questionType: 'recall', performance: 0.90 }),
    ev({ studentId: S, skillId: 'time_and_work', timestamp: daysAgo(13), source: 'practice', difficulty: 'medium', questionType: 'application', performance: 0.85 }),
    ev({ studentId: S, skillId: 'time_and_work', timestamp: daysAgo(7), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.50 }),
    ev({ studentId: S, skillId: 'time_and_work', timestamp: daysAgo(2), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.44 }),
  ].forEach((e) => repo.addEvidence(e));

  // ---------------------------------------------------------------
  // PROBABILITY — recurring weakness. One full recover-then-relapse
  // cycle already on record, plus a second recovery whose delayed check
  // also failed. This should trigger the "we've noticed a pattern"
  // experience and an escalated (worked-example) intervention.
  // ---------------------------------------------------------------
  [
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(30), source: 'initial_assessment', difficulty: 'medium', questionType: 'recall', performance: 0.80 }),
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(25), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.45 }),
  ].forEach((e) => repo.addEvidence(e));

  const probSession1Id = nextId('rs');
  repo.addRecoverySession({
    id: probSession1Id, studentId: S, skillId: 'probability', createdAt: daysAgo(22),
    failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
    status: 'VERIFIED_STABLE', beforeScore: 0.45, immediateScore: 0.85, delayedScore: 0.78,
    delayedVerificationAt: daysAgo(18),
  });
  [
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(22), source: 'recovery_immediate_verification', difficulty: 'medium', questionType: 'application', performance: 0.85 }),
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(18), source: 'recovery_delayed_verification', difficulty: 'medium', questionType: 'recall', performance: 0.78 }),
    // ...then it slips again some time later, despite having "passed":
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(10), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.50 }),
  ].forEach((e) => repo.addEvidence(e));

  const probSession2Id = nextId('rs');
  repo.addRecoverySession({
    id: probSession2Id, studentId: S, skillId: 'probability', createdAt: daysAgo(8),
    failureType: 'RETRIEVAL_FAILURE', interventionType: 'TIMED_RETRIEVAL', escalationLevel: 1,
    status: 'VERIFICATION_FAILED', beforeScore: 0.50, immediateScore: 0.82, delayedScore: 0.55,
    delayedVerificationAt: daysAgo(4),
  });
  [
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(8), source: 'recovery_immediate_verification', difficulty: 'medium', questionType: 'application', performance: 0.82 }),
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(4), source: 'recovery_delayed_verification', difficulty: 'medium', questionType: 'recall', performance: 0.55 }),
    ev({ studentId: S, skillId: 'probability', timestamp: daysAgo(1), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.48 }),
  ].forEach((e) => repo.addEvidence(e));

  // ---------------------------------------------------------------
  // PERMUTATION & COMBINATION — recovered recently, immediate check
  // already passed, delayed check hasn't happened yet: "verification
  // required", the shortest of the three interactive entry points.
  // ---------------------------------------------------------------
  [
    ev({ studentId: S, skillId: 'permutation_combination', timestamp: daysAgo(15), source: 'initial_assessment', difficulty: 'medium', questionType: 'recall', performance: 0.75 }),
    ev({ studentId: S, skillId: 'permutation_combination', timestamp: daysAgo(9), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: 0.48 }),
  ].forEach((e) => repo.addEvidence(e));

  repo.addRecoverySession({
    id: nextId('rs'), studentId: S, skillId: 'permutation_combination', createdAt: daysAgo(6),
    failureType: 'RETRIEVAL_FAILURE', interventionType: 'ACTIVE_RECALL', escalationLevel: 0,
    status: 'AWAITING_DELAYED_VERIFICATION', beforeScore: 0.48, immediateScore: 0.88, delayedScore: null,
    delayedVerificationAt: null,
  });
  repo.addEvidence(ev({ studentId: S, skillId: 'permutation_combination', timestamp: daysAgo(6), source: 'recovery_immediate_verification', difficulty: 'medium', questionType: 'application', performance: 0.88 }));

  // ---------------------------------------------------------------
  // STABLE SKILLS — consistently high, low-variance delayed checks.
  // ---------------------------------------------------------------
  const stableSkills: [string, number][] = [
    ['percentages', 0.88],
    ['ratio_proportion', 0.86],
    ['averages', 0.84],
  ];
  stableSkills.forEach(([skillId, base]) => {
    [
      ev({ studentId: S, skillId, timestamp: daysAgo(20), source: 'initial_assessment', difficulty: 'medium', questionType: 'recall', performance: base + 0.03 }),
      ev({ studentId: S, skillId, timestamp: daysAgo(14), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: base + 0.01 }),
      ev({ studentId: S, skillId, timestamp: daysAgo(7), source: 'delayed_recall', difficulty: 'medium', questionType: 'application', performance: base - 0.02 }),
      ev({ studentId: S, skillId, timestamp: daysAgo(2), source: 'delayed_recall', difficulty: 'medium', questionType: 'recall', performance: base }),
    ].forEach((e) => repo.addEvidence(e));
  });

  // ---------------------------------------------------------------
  // RECENTLY LEARNED — learned very recently, no delayed check yet.
  // ---------------------------------------------------------------
  [
    ev({ studentId: S, skillId: 'data_interpretation', timestamp: daysAgo(2), source: 'initial_assessment', difficulty: 'medium', questionType: 'recall', performance: 0.78 }),
    ev({ studentId: S, skillId: 'data_interpretation', timestamp: daysAgo(1), source: 'practice', difficulty: 'medium', questionType: 'application', performance: 0.82 }),
  ].forEach((e) => repo.addEvidence(e));

  // LOGICAL_REASONING intentionally has zero evidence anywhere: it's the
  // "brand new skill, nothing to assess yet" (NOT_LEARNED) edge case.
  // Because getSkillIdsForStudent derives skill IDs from evidence and
  // assessments, a skill with neither simply won't appear in the
  // dashboard — which is the correct, honest behaviour (see
  // tests/edgeCases.test.ts for the direct NOT_LEARNED assertion).
}
