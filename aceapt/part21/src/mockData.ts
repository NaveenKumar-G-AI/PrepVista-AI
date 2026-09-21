// ============================================================
// MOCK DATA — for local development and the demo script ONLY.
//
// This stands in for real Feature 13–20 output so the engine can
// be exercised end to end without a live ACEAPT backend. Three
// students are seeded, each hand-built to exercise a different
// part of the spec:
//
//   Priya  — a prerequisite bottleneck (percentage under-repair
//            surfaces as weak probability/ratio/discount), plus
//            one skill with too little evidence to diagnose, plus
//            one already-resolved issue with a verified before/after.
//   Arjun  — a clean retrieval-weakness case (mastered 14 days ago,
//            delayed recall weak, correct once hinted).
//   Meera  — a pressure/execution case (strong untimed, weak timed,
//            retention & reasoning both fine), plus a second skill
//            that has already failed two rungs of the escalation
//            ladder, to exercise escalation logic.
//
// Replace this whole file with real queries against Features
// 13–20 when you wire in MockUpstreamBundle's real counterpart.
// Nothing outside upstreamAdapters.ts and this file should need to
// change.
// ============================================================

import {
  AttemptEvidence,
  InterventionRecord,
  MasteryEvidence,
  ReasoningTraceEvidence,
  RetentionEvidence,
  Skill,
  SimulationEvidence,
  Student,
  TransferEvidence,
} from './types';
import { MockDataset, StudentFixture } from './upstreamAdapters';

const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

// ------------------------------------------------------------
// Skill graph — a small, realistic slice of a quant-aptitude
// curriculum. Percentage sits under several other topics, which
// is what makes the root-cause example work.
// ------------------------------------------------------------

export const SKILLS: Skill[] = [
  { id: 'arithmetic', name: 'Basic Arithmetic', topic: 'Foundations', prerequisiteIds: [] },
  { id: 'percentage', name: 'Percentage', topic: 'Foundations', prerequisiteIds: ['arithmetic'] },
  { id: 'ratio', name: 'Ratio & Proportion', topic: 'Foundations', prerequisiteIds: ['arithmetic'] },
  { id: 'probability', name: 'Probability', topic: 'Advanced', prerequisiteIds: ['percentage', 'ratio'] },
  { id: 'discount', name: 'Discount', topic: 'Commercial Math', prerequisiteIds: ['percentage'] },
  { id: 'profit_loss', name: 'Profit & Loss', topic: 'Commercial Math', prerequisiteIds: ['percentage'] },
  { id: 'time_and_work', name: 'Time & Work', topic: 'Advanced', prerequisiteIds: ['ratio'] },
  {
    id: 'compound_interest',
    name: 'Compound Interest',
    topic: 'Commercial Math',
    prerequisiteIds: ['percentage', 'ratio'],
  },
  { id: 'number_series', name: 'Number Series', topic: 'Foundations', prerequisiteIds: [] },
];

export const STUDENTS: Student[] = [
  {
    id: 'stu_priya',
    name: 'Priya',
    goal: 'PLACEMENT_READINESS',
    targetAssessmentDate: daysFromNow(10),
    dailyTimeBudgetMinutes: 20,
  },
  {
    id: 'stu_arjun',
    name: 'Arjun',
    goal: 'MAINTAIN_MASTERY',
    targetAssessmentDate: null,
    dailyTimeBudgetMinutes: 15,
  },
  {
    id: 'stu_meera',
    name: 'Meera',
    goal: 'SPEED_IMPROVEMENT',
    targetAssessmentDate: daysFromNow(30),
    dailyTimeBudgetMinutes: 25,
  },
];

// ------------------------------------------------------------
// Priya — prerequisite bottleneck + insufficient evidence + a
// resolved, verified transfer-failure history.
// ------------------------------------------------------------

const priyaAttempts: AttemptEvidence[] = [
  // Arithmetic — solid, exists only so it's a clean (non-weak) anchor.
  ...[0, 1, 2].map(
    (i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'arithmetic',
      timestamp: daysAgo(20 - i),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: true,
      timed: false,
      responseTimeSeconds: 30,
      benchmarkTimeSeconds: 35,
      hintsUsed: 0,
      difficulty: 'easy',
      questionContextFamiliarity: 'familiar',
    })
  ),
  // Percentage — 3 of 5 wrong, all sharing the same misconception tag.
  ...[
    { correct: true, tag: undefined },
    { correct: false, tag: 'denominator-selection-error' },
    { correct: false, tag: 'denominator-selection-error' },
    { correct: false, tag: 'denominator-selection-error' },
    { correct: true, tag: undefined },
  ].map(
    (a, i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'percentage',
      timestamp: daysAgo(12 - i * 2),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: a.correct,
      timed: false,
      responseTimeSeconds: 50,
      benchmarkTimeSeconds: 45,
      hintsUsed: 0,
      difficulty: 'medium',
      errorPatternTag: a.tag,
      questionContextFamiliarity: 'familiar',
    })
  ),
  // Discount — same misconception leaking into a downstream skill.
  ...[
    { correct: false, tag: 'denominator-selection-error' },
    { correct: false, tag: 'denominator-selection-error' },
    { correct: true, tag: undefined },
  ].map(
    (a, i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'discount',
      timestamp: daysAgo(9 - i * 2),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: a.correct,
      timed: false,
      responseTimeSeconds: 55,
      benchmarkTimeSeconds: 45,
      hintsUsed: 0,
      difficulty: 'medium',
      errorPatternTag: a.tag,
      questionContextFamiliarity: 'familiar',
    })
  ),
  // Ratio — moderately weak, but no single dominant pattern.
  ...[
    { correct: true, tag: undefined },
    { correct: false, tag: 'procedure-order-error' },
    { correct: false, tag: 'arithmetic-slip' },
    { correct: true, tag: undefined },
  ].map(
    (a, i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'ratio',
      timestamp: daysAgo(11 - i * 2),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: a.correct,
      timed: false,
      responseTimeSeconds: 48,
      benchmarkTimeSeconds: 45,
      hintsUsed: 0,
      difficulty: 'medium',
      errorPatternTag: a.tag,
      questionContextFamiliarity: 'familiar',
    })
  ),
  // Probability — inherits some of the percentage misconception, but not
  // dominantly enough to be its own concept-misunderstanding diagnosis.
  ...[
    { correct: true, tag: undefined },
    { correct: true, tag: undefined },
    { correct: false, tag: 'denominator-selection-error' },
    { correct: true, tag: undefined },
    { correct: false, tag: undefined },
    { correct: true, tag: undefined },
  ].map(
    (a, i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'probability',
      timestamp: daysAgo(10 - i),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: a.correct,
      timed: false,
      responseTimeSeconds: 60,
      benchmarkTimeSeconds: 55,
      hintsUsed: 0,
      difficulty: 'medium',
      errorPatternTag: a.tag,
      questionContextFamiliarity: 'familiar',
    })
  ),
  // Number Series — a single data point, and no weak prerequisite to lean
  // on either. Genuinely not enough evidence to diagnose anything yet.
  {
    type: 'ATTEMPT',
    skillId: 'number_series',
    timestamp: daysAgo(2),
    sourceFeature: 'F17_QUESTION_INTELLIGENCE',
    isCorrect: false,
    timed: false,
    responseTimeSeconds: 70,
    benchmarkTimeSeconds: 60,
    hintsUsed: 0,
    difficulty: 'medium',
    questionContextFamiliarity: 'familiar',
  },
];

const priyaMastery: MasteryEvidence[] = [
  { type: 'MASTERY', skillId: 'arithmetic', timestamp: daysAgo(60), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.9, masteredOn: daysAgo(90), neverLearned: false },
  { type: 'MASTERY', skillId: 'percentage', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.45, masteredOn: daysAgo(50), neverLearned: false },
  { type: 'MASTERY', skillId: 'ratio', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.5, masteredOn: daysAgo(45), neverLearned: false },
  { type: 'MASTERY', skillId: 'probability', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.55, masteredOn: daysAgo(20), neverLearned: false },
  { type: 'MASTERY', skillId: 'discount', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.5, masteredOn: daysAgo(18), neverLearned: false },
  { type: 'MASTERY', skillId: 'number_series', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.4, neverLearned: false },
  { type: 'MASTERY', skillId: 'profit_loss', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.78, masteredOn: daysAgo(40), neverLearned: false },
];

// Profit & Loss: transfer is healthy NOW because the intervention below
// already fixed it. The "before" numbers live in the intervention record,
// not here — that's what makes the before/after comparison meaningful.
const priyaTransfer: TransferEvidence[] = [
  {
    type: 'TRANSFER',
    skillId: 'profit_loss',
    timestamp: daysAgo(3),
    sourceFeature: 'F14_MASTERY_TRANSFER',
    familiarContextAccuracy: 0.85,
    novelContextAccuracy: 0.78,
  },
];

const priyaInterventions: InterventionRecord[] = [
  {
    id: 'iv_priya_1',
    studentId: 'stu_priya',
    skillId: 'profit_loss',
    diagnosisCategory: 'TRANSFER_FAILURE',
    actionType: 'CONTRASTIVE_PRACTICE',
    startedAt: daysAgo(10),
    beforeMetric: 0.42,
    afterMetric: 0.78,
    verifiedAt: daysAgo(3),
    outcome: 'IMPROVED',
  },
];

// A little session-fatigue signal layered onto today's percentage
// practice — independent of the misconception itself.
const priyaSimulation: SimulationEvidence[] = [
  {
    type: 'SIMULATION',
    skillId: 'percentage',
    timestamp: daysAgo(0),
    sourceFeature: 'F20_SIMULATION_PRESSURE',
    timedAccuracy: 0.5,
    untimedAccuracy: 0.55,
    questionOrderEfficiencyScore: 0.7,
    sessionAbandonmentRate: 0.3,
    rapidGuessRate: 0.4,
  },
];

const priyaFixture: StudentFixture = {
  attempts: priyaAttempts,
  reasoningTraces: [],
  retention: [],
  transfer: priyaTransfer,
  simulation: priyaSimulation,
  mastery: priyaMastery,
  interventions: priyaInterventions,
};

// ------------------------------------------------------------
// Arjun — textbook retrieval weakness on Probability, plus a
// clean, untroubled Ratio for contrast.
// ------------------------------------------------------------

const arjunAttempts: AttemptEvidence[] = [
  { type: 'ATTEMPT', skillId: 'probability', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: false, responseTimeSeconds: 65, benchmarkTimeSeconds: 55, hintsUsed: 0, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  { type: 'ATTEMPT', skillId: 'probability', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: false, responseTimeSeconds: 70, benchmarkTimeSeconds: 55, hintsUsed: 0, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  // Correct once a hint is given — reasoning is intact, retrieval was the blocker.
  { type: 'ATTEMPT', skillId: 'probability', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: true, timed: false, responseTimeSeconds: 50, benchmarkTimeSeconds: 55, hintsUsed: 1, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  ...[0, 1, 2, 3].map(
    (i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'ratio',
      timestamp: daysAgo(5 - i),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: true,
      timed: false,
      responseTimeSeconds: 40,
      benchmarkTimeSeconds: 45,
      hintsUsed: 0,
      difficulty: 'medium',
      questionContextFamiliarity: 'familiar',
    })
  ),
];

const arjunReasoning: ReasoningTraceEvidence[] = [
  {
    type: 'REASONING_TRACE',
    skillId: 'probability',
    timestamp: daysAgo(1),
    sourceFeature: 'F18_REASONING_INTELLIGENCE',
    stepsCorrect: true,
    finalAnswerCorrect: false,
  },
];

const arjunRetention: RetentionEvidence[] = [
  {
    type: 'RETENTION',
    skillId: 'probability',
    timestamp: daysAgo(1),
    sourceFeature: 'F19_RETENTION',
    daysSinceLastMastery: 14,
    predictedRetentionStrength: 0.78,
    observedRecallStrength: 0.45,
  },
];

const arjunMastery: MasteryEvidence[] = [
  { type: 'MASTERY', skillId: 'probability', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.65, masteredOn: daysAgo(14), neverLearned: false },
  { type: 'MASTERY', skillId: 'ratio', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.85, masteredOn: daysAgo(60), neverLearned: false },
];

const arjunFixture: StudentFixture = {
  attempts: arjunAttempts,
  reasoningTraces: arjunReasoning,
  retention: arjunRetention,
  transfer: [],
  simulation: [],
  mastery: arjunMastery,
  interventions: [],
};

// ------------------------------------------------------------
// Meera — pressure/execution gap on Time & Work, plus Profit &
// Loss, where two remediation rungs have already failed.
// ------------------------------------------------------------

const meeraSimulation: SimulationEvidence[] = [
  {
    type: 'SIMULATION',
    skillId: 'time_and_work',
    timestamp: daysAgo(1),
    sourceFeature: 'F20_SIMULATION_PRESSURE',
    timedAccuracy: 0.61,
    untimedAccuracy: 0.95,
    questionOrderEfficiencyScore: 0.75,
    sessionAbandonmentRate: 0.05,
    rapidGuessRate: 0.08,
  },
];

const meeraRetention: RetentionEvidence[] = [
  {
    type: 'RETENTION',
    skillId: 'time_and_work',
    timestamp: daysAgo(1),
    sourceFeature: 'F19_RETENTION',
    daysSinceLastMastery: 20,
    predictedRetentionStrength: 0.8,
    observedRecallStrength: 0.85,
  },
];

const meeraReasoning: ReasoningTraceEvidence[] = [
  { type: 'REASONING_TRACE', skillId: 'time_and_work', timestamp: daysAgo(2), sourceFeature: 'F18_REASONING_INTELLIGENCE', stepsCorrect: true, finalAnswerCorrect: true },
  { type: 'REASONING_TRACE', skillId: 'time_and_work', timestamp: daysAgo(1), sourceFeature: 'F18_REASONING_INTELLIGENCE', stepsCorrect: true, finalAnswerCorrect: false },
];

const meeraAttempts: AttemptEvidence[] = [
  { type: 'ATTEMPT', skillId: 'time_and_work', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: true, responseTimeSeconds: 62, benchmarkTimeSeconds: 55, hintsUsed: 0, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  { type: 'ATTEMPT', skillId: 'time_and_work', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: true, timed: true, responseTimeSeconds: 58, benchmarkTimeSeconds: 55, hintsUsed: 0, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  { type: 'ATTEMPT', skillId: 'time_and_work', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: true, responseTimeSeconds: 60, benchmarkTimeSeconds: 55, hintsUsed: 0, difficulty: 'medium', questionContextFamiliarity: 'familiar' },
  // Profit & Loss — a procedural (steps-out-of-order) error, seen repeatedly.
  { type: 'ATTEMPT', skillId: 'profit_loss', timestamp: daysAgo(4), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: false, responseTimeSeconds: 90, benchmarkTimeSeconds: 60, hintsUsed: 0, difficulty: 'medium', errorPatternTag: 'procedure-order-error', questionContextFamiliarity: 'familiar' },
  { type: 'ATTEMPT', skillId: 'profit_loss', timestamp: daysAgo(3), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: false, responseTimeSeconds: 85, benchmarkTimeSeconds: 60, hintsUsed: 0, difficulty: 'medium', errorPatternTag: 'procedure-order-error', questionContextFamiliarity: 'familiar' },
  { type: 'ATTEMPT', skillId: 'profit_loss', timestamp: daysAgo(1), sourceFeature: 'F17_QUESTION_INTELLIGENCE', isCorrect: false, timed: false, responseTimeSeconds: 88, benchmarkTimeSeconds: 60, hintsUsed: 0, difficulty: 'medium', errorPatternTag: 'procedure-order-error', questionContextFamiliarity: 'familiar' },
  // Percentage — clean, for contrast (nothing wrong here).
  ...[0, 1, 2, 3].map(
    (i): AttemptEvidence => ({
      type: 'ATTEMPT',
      skillId: 'percentage',
      timestamp: daysAgo(6 - i),
      sourceFeature: 'F17_QUESTION_INTELLIGENCE',
      isCorrect: true,
      timed: false,
      responseTimeSeconds: 40,
      benchmarkTimeSeconds: 45,
      hintsUsed: 0,
      difficulty: 'medium',
      questionContextFamiliarity: 'familiar',
    })
  ),
];

const meeraMastery: MasteryEvidence[] = [
  { type: 'MASTERY', skillId: 'time_and_work', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.8, masteredOn: daysAgo(20), neverLearned: false },
  { type: 'MASTERY', skillId: 'profit_loss', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.42, masteredOn: daysAgo(30), neverLearned: false },
  { type: 'MASTERY', skillId: 'percentage', timestamp: daysAgo(1), sourceFeature: 'F14_MASTERY_TRANSFER', masteryLevel: 0.85, masteredOn: daysAgo(70), neverLearned: false },
];

// Two rungs of the escalation ladder already tried on Profit & Loss, both
// unsuccessful — the engine should refuse to recommend either again.
const meeraInterventions: InterventionRecord[] = [
  {
    id: 'iv_meera_1',
    studentId: 'stu_meera',
    skillId: 'profit_loss',
    diagnosisCategory: 'PROCEDURAL_ERROR',
    actionType: 'RECALL',
    startedAt: daysAgo(12),
    beforeMetric: 0.4,
    afterMetric: 0.38,
    verifiedAt: daysAgo(10),
    outcome: 'NO_CHANGE',
  },
  {
    id: 'iv_meera_2',
    studentId: 'stu_meera',
    skillId: 'profit_loss',
    diagnosisCategory: 'PROCEDURAL_ERROR',
    actionType: 'REVIEW',
    startedAt: daysAgo(8),
    beforeMetric: 0.4,
    afterMetric: 0.42,
    verifiedAt: daysAgo(6),
    outcome: 'NO_CHANGE',
  },
  // A third rung — guided practice, which is what PROCEDURAL_ERROR would
  // naturally recommend on its own — has ALSO already failed. This is
  // what forces genuine escalation past the diagnosis's default pick,
  // rather than the trivial case where the default already outranks
  // whatever failed before it.
  {
    id: 'iv_meera_3',
    studentId: 'stu_meera',
    skillId: 'profit_loss',
    diagnosisCategory: 'PROCEDURAL_ERROR',
    actionType: 'PRACTICE',
    startedAt: daysAgo(5),
    beforeMetric: 0.41,
    afterMetric: 0.42,
    verifiedAt: daysAgo(2),
    outcome: 'NO_CHANGE',
  },
];

const meeraFixture: StudentFixture = {
  attempts: meeraAttempts,
  reasoningTraces: meeraReasoning,
  retention: meeraRetention,
  transfer: [],
  simulation: meeraSimulation,
  mastery: meeraMastery,
  interventions: meeraInterventions,
};

// ------------------------------------------------------------

export const MOCK_DATASET: MockDataset = {
  students: STUDENTS,
  skills: SKILLS,
  byStudent: {
    stu_priya: priyaFixture,
    stu_arjun: arjunFixture,
    stu_meera: meeraFixture,
  },
};

/** Which skills to run the diagnosis pipeline over, per student — in a real
 * system this would come from Feature 15's "recently active skills" list. */
export const DIAGNOSIS_SCOPE: Record<string, string[]> = {
  stu_priya: ['percentage', 'ratio', 'probability', 'discount', 'number_series', 'profit_loss'],
  stu_arjun: ['probability', 'ratio'],
  stu_meera: ['time_and_work', 'profit_loss', 'percentage'],
};
