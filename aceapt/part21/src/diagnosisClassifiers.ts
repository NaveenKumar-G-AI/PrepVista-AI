// ============================================================
// DIAGNOSIS CLASSIFIERS (spec §3, §4, §8)
//
// Sixteen independent, evidence-first classifiers — one per
// diagnosis category A–P from the spec's taxonomy. Categories Q
// (INCONSISTENT_PERFORMANCE) and R (INSUFFICIENT_EVIDENCE) are
// deliberately NOT classifiers here: they are fallback judgements
// the engine reaches only after seeing what these 16 could and
// couldn't explain (see diagnosisEngine.ts). That separation is
// what keeps the false-positive protection in §38 honest — a
// fallback that could also "win" on its own merits would defeat
// the point of it being a fallback.
//
// Every classifier follows the same shape: look at the evidence it
// needs, and if that evidence isn't there, return null rather than
// guessing. Thresholds are named constants below so they can be
// tuned against real outcome data later — they are principled
// starting points, not the final word (spec §41).
// ============================================================

import { clusterErrors } from './errorClustering';
import { getWeakPrerequisites } from './rootCauseGraph';
import {
  ActionType,
  AttemptEvidence,
  ConfidenceLevel,
  DiagnosisCategory,
  DiagnosisHypothesis,
  EvidenceItem,
  MasteryEvidence,
  ReasoningTraceEvidence,
  RetentionEvidence,
  Skill,
  SkillId,
  SimulationEvidence,
  TransferEvidence,
} from './types';

export interface ClassifierContext {
  skillId: SkillId;
  evidence: EvidenceItem[];
  skills: Skill[];
  /** Mastery level (0–1) for every skill this student has evidence for, including skillId's own prerequisites. */
  masteryBySkill: Map<SkillId, number>;
}

export type Classifier = (ctx: ClassifierContext) => DiagnosisHypothesis | null;

// ---- thresholds (principled starting points — tune with real data) ------

const WEAK_MASTERY_THRESHOLD = 0.6;
const MIN_WRONG_FOR_PATTERN = 2;

// ---- evidence extraction helpers -----------------------------------------

const getAttempts = (ctx: ClassifierContext): AttemptEvidence[] =>
  ctx.evidence.filter((e): e is AttemptEvidence => e.type === 'ATTEMPT');
const getReasoningTraces = (ctx: ClassifierContext): ReasoningTraceEvidence[] =>
  ctx.evidence.filter((e): e is ReasoningTraceEvidence => e.type === 'REASONING_TRACE');
const getRetention = (ctx: ClassifierContext): RetentionEvidence | null =>
  ctx.evidence.find((e): e is RetentionEvidence => e.type === 'RETENTION') ?? null;
const getTransfer = (ctx: ClassifierContext): TransferEvidence | null =>
  ctx.evidence.find((e): e is TransferEvidence => e.type === 'TRANSFER') ?? null;
const getSimulation = (ctx: ClassifierContext): SimulationEvidence | null =>
  ctx.evidence.find((e): e is SimulationEvidence => e.type === 'SIMULATION') ?? null;
const getMastery = (ctx: ClassifierContext): MasteryEvidence | null =>
  ctx.evidence.find((e): e is MasteryEvidence => e.type === 'MASTERY') ?? null;

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  if (score >= 0.25) return 'LOW';
  return 'UNKNOWN';
}

function makeHypothesis(
  category: DiagnosisCategory,
  ctx: ClassifierContext,
  score: number,
  evidenceSummary: string[],
  recommendedActionTypes: ActionType[],
  verificationMethod: string,
  affectedSkillIds?: SkillId[]
): DiagnosisHypothesis {
  return {
    category,
    skillId: ctx.skillId,
    confidence: scoreToLevel(score),
    confidenceScore: clamp01(score),
    evidenceSummary,
    affectedSkillIds: affectedSkillIds ?? [ctx.skillId],
    recommendedActionTypes,
    verificationMethod,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ============================================================
// A. CONCEPT GAP
// ============================================================
export const conceptGap: Classifier = (ctx) => {
  const mastery = getMastery(ctx);
  if (!mastery || !mastery.neverLearned) return null;
  return makeHypothesis(
    'CONCEPT_GAP',
    ctx,
    0.85,
    ['No prior evidence this concept was ever taught or attempted.'],
    ['LEARN'],
    'First correct attempt at easy difficulty after a learning session.'
  );
};

// ============================================================
// E. PREREQUISITE GAP
// ============================================================
export const prerequisiteGap: Classifier = (ctx) => {
  const weakPrereqs = getWeakPrerequisites(ctx.skillId, ctx.skills, ctx.masteryBySkill, WEAK_MASTERY_THRESHOLD);
  if (weakPrereqs.length === 0) return null;

  // A prerequisite being weak only explains THIS skill's trouble if this
  // skill is actually showing some trouble. A skill that's doing fine
  // doesn't need "fixing" just because something upstream is shaky — that
  // would be inventing a weakness rather than explaining one (spec §38
  // false-positive protection, applied to root-cause reasoning too).
  const ownMastery = ctx.masteryBySkill.get(ctx.skillId);
  const hasOwnWeakness = (ownMastery !== undefined && ownMastery < 0.75) || getAttempts(ctx).some((a) => !a.isCorrect);
  if (!hasOwnWeakness) return null;

  const weakest = [...weakPrereqs].sort((a, b) => a.masteryLevel - b.masteryLevel)[0];
  const score = weakPrereqs.length >= 2 || weakest.masteryLevel < 0.4 ? 0.8 : 0.6;
  return makeHypothesis(
    'PREREQUISITE_GAP',
    ctx,
    score,
    weakPrereqs.map(
      (p) => `Prerequisite "${p.skillId}" mastery is ${(p.masteryLevel * 100).toFixed(0)}%, below the ${(WEAK_MASTERY_THRESHOLD * 100).toFixed(0)}% threshold.`
    ),
    ['RESTORE_PREREQUISITE'],
    'Re-check this skill after prerequisite mastery crosses 70%.',
    [ctx.skillId, ...weakPrereqs.map((p) => p.skillId)]
  );
};

// ============================================================
// C. RETRIEVAL WEAKNESS
// ============================================================
export const retrievalWeakness: Classifier = (ctx) => {
  const retention = getRetention(ctx);
  if (!retention) return null;
  const { daysSinceLastMastery, predictedRetentionStrength, observedRecallStrength } = retention;
  const gap = predictedRetentionStrength - observedRecallStrength;
  if (daysSinceLastMastery < 7 || observedRecallStrength > 0.55 || gap < 0.15) return null;

  const hintAssistedCorrect = getAttempts(ctx).some((a) => a.hintsUsed > 0 && a.isCorrect);
  if (!hintAssistedCorrect) return null; // that pattern belongs to RETENTION_DECAY instead

  return makeHypothesis(
    'RETRIEVAL_WEAKNESS',
    ctx,
    daysSinceLastMastery >= 10 && observedRecallStrength <= 0.5 ? 0.85 : 0.6,
    [
      `Mastered ${daysSinceLastMastery} days ago; independent recall is now weak (${(observedRecallStrength * 100).toFixed(0)}%, predicted ${(predictedRetentionStrength * 100).toFixed(0)}%).`,
      'Reasoning was correct once a hint was given — the knowledge is there, access to it is the blocker.',
    ],
    ['RECALL', 'REACTIVATE'],
    'Unassisted delayed recall in 2–3 days.'
  );
};

// ============================================================
// D. RETENTION DECAY
// ============================================================
export const retentionDecay: Classifier = (ctx) => {
  const retention = getRetention(ctx);
  if (!retention) return null;
  const { daysSinceLastMastery, predictedRetentionStrength, observedRecallStrength } = retention;
  if (daysSinceLastMastery < 10 || observedRecallStrength > 0.5 || predictedRetentionStrength > 0.55) return null;

  const hintAssistedCorrect = getAttempts(ctx).some((a) => a.hintsUsed > 0 && a.isCorrect);
  if (hintAssistedCorrect) return null; // that pattern belongs to RETRIEVAL_WEAKNESS instead

  return makeHypothesis(
    'RETENTION_DECAY',
    ctx,
    0.75,
    [
      `${daysSinceLastMastery} days since mastery; both the decay model and observed recall (${(observedRecallStrength * 100).toFixed(0)}%) agree this has genuinely faded.`,
      'Even hint-assisted attempts are not succeeding.',
    ],
    ['REACTIVATE', 'RELEARN'],
    'Recheck recall strength after a reactivation session.'
  );
};

// ============================================================
// F. TRANSFER FAILURE
// ============================================================
export const transferFailure: Classifier = (ctx) => {
  const transfer = getTransfer(ctx);
  if (!transfer) return null;
  const gap = transfer.familiarContextAccuracy - transfer.novelContextAccuracy;
  if (gap < 0.3) return null;
  return makeHypothesis(
    'TRANSFER_FAILURE',
    ctx,
    gap >= 0.4 ? 0.85 : 0.6,
    [
      `Familiar-context accuracy ${(transfer.familiarContextAccuracy * 100).toFixed(0)}% vs. novel-context accuracy ${(transfer.novelContextAccuracy * 100).toFixed(0)}%.`,
    ],
    ['CONTRASTIVE_PRACTICE', 'TRANSFER'],
    'Re-test novel-context accuracy after contrastive practice.'
  );
};

// ============================================================
// N. PRESSURE PERFORMANCE DEGRADATION
// ============================================================
export const pressurePerformanceDegradation: Classifier = (ctx) => {
  const sim = getSimulation(ctx);
  if (!sim) return null;
  const gap = sim.untimedAccuracy - sim.timedAccuracy;
  if (gap < 0.25) return null;

  const retention = getRetention(ctx);
  const traces = getReasoningTraces(ctx);
  const reasoningLooksFine = traces.length === 0 || traces.filter((t) => t.stepsCorrect).length / traces.length >= 0.6;
  const retentionLooksFine = !retention || retention.observedRecallStrength >= 0.7;
  if (!reasoningLooksFine || !retentionLooksFine) return null; // conflicting signal — don't over-claim pressure alone

  return makeHypothesis(
    'PRESSURE_PERFORMANCE_DEGRADATION',
    ctx,
    gap >= 0.3 ? 0.85 : 0.6,
    [
      `Untimed accuracy ${(sim.untimedAccuracy * 100).toFixed(0)}% vs. timed accuracy ${(sim.timedAccuracy * 100).toFixed(0)}% — a ${(gap * 100).toFixed(0)}-point drop.`,
      'Reasoning and retention both check out fine outside the timed condition, so this looks like an execution-under-pressure issue, not a knowledge gap.',
    ],
    ['TIMED_PRACTICE', 'MOCK_TEST'],
    'Compare timed vs. untimed accuracy again after a timed-practice cycle.'
  );
};

// ============================================================
// B. CONCEPT MISUNDERSTANDING
// ============================================================
export const conceptMisunderstanding: Classifier = (ctx) => {
  const wrong = getAttempts(ctx).filter((a) => !a.isCorrect);
  if (wrong.length < MIN_WRONG_FOR_PATTERN) return null;
  const clusters = clusterErrors(getAttempts(ctx));
  const top = clusters[0];
  if (!top || top.patternTag === 'untagged') return null;
  // Tags with their own dedicated classifier shouldn't also be claimed here.
  if (['arithmetic-slip', 'procedure-order-error', 'misread-condition'].includes(top.patternTag)) return null;
  const share = top.count / wrong.length;
  if (share < 0.75) return null;
  return makeHypothesis(
    'CONCEPT_MISUNDERSTANDING',
    ctx,
    wrong.length >= 3 ? 0.85 : 0.6,
    [`${top.count} of ${wrong.length} wrong attempts share the same underlying pattern: "${top.patternTag}".`],
    ['RELEARN', 'MICRO_QUIZ'],
    'Targeted questions that specifically probe this misconception.'
  );
};

// ============================================================
// J. CALCULATION ERROR
// ============================================================
export const calculationError: Classifier = (ctx) => {
  const attempts = getAttempts(ctx);
  const clusters = clusterErrors(attempts);
  const cluster = clusters.find((c) => c.patternTag === 'arithmetic-slip');
  if (!cluster) return null;
  const traces = getReasoningTraces(ctx);
  const reasoningIntact = traces.length === 0 || traces.some((t) => t.stepsCorrect && !t.finalAnswerCorrect);
  return makeHypothesis(
    'CALCULATION_ERROR',
    ctx,
    cluster.count >= 2 ? 0.55 : 0.3,
    [
      `${cluster.count} wrong attempt(s) show an arithmetic slip rather than a conceptual error.`,
      ...(reasoningIntact ? ['Reasoning steps were correct up to the final arithmetic.'] : []),
    ],
    ['MICRO_QUIZ', 'REVIEW'],
    'A few clean arithmetic checks embedded in normal practice.'
  );
};

// ============================================================
// K. CARELESS ERROR
// ============================================================
export const carelessError: Classifier = (ctx) => {
  const attempts = getAttempts(ctx);
  const wrong = attempts.filter((a) => !a.isCorrect);
  const mastery = getMastery(ctx);
  if (wrong.length !== 1 || !mastery || mastery.masteryLevel < 0.75) return null;
  const theWrongOne = wrong[0];
  const isRushed = theWrongOne.responseTimeSeconds <= theWrongOne.benchmarkTimeSeconds * 0.6;
  if (!isRushed) return null;
  return makeHypothesis(
    'CARELESS_ERROR',
    ctx,
    0.35,
    [
      'A single wrong attempt against an otherwise strong mastery record.',
      'Answered well under the usual benchmark time, consistent with rushing rather than not knowing it.',
    ],
    ['WAIT'],
    'No action needed unless the pattern repeats.'
  );
};

// ============================================================
// L. TIME EFFICIENCY ISSUE
// ============================================================
export const timeEfficiencyIssue: Classifier = (ctx) => {
  const timed = getAttempts(ctx).filter((a) => a.timed);
  if (timed.length < 2) return null;
  const avgRatio = timed.reduce((sum, a) => sum + a.responseTimeSeconds / a.benchmarkTimeSeconds, 0) / timed.length;
  if (avgRatio < 1.3) return null;
  return makeHypothesis(
    'TIME_EFFICIENCY_ISSUE',
    ctx,
    avgRatio >= 1.5 ? 0.7 : 0.5,
    [`Averaging ${avgRatio.toFixed(2)}× the benchmark time on timed attempts.`],
    ['TIMED_PRACTICE'],
    'Track average time-to-benchmark ratio over the next timed set.'
  );
};

// ============================================================
// M. QUESTION SELECTION ISSUE
// ============================================================
export const questionSelectionIssue: Classifier = (ctx) => {
  const sim = getSimulation(ctx);
  if (!sim || sim.questionOrderEfficiencyScore >= 0.5) return null;
  return makeHypothesis(
    'QUESTION_SELECTION_ISSUE',
    ctx,
    sim.questionOrderEfficiencyScore < 0.35 ? 0.7 : 0.55,
    [`Question-order efficiency score is ${(sim.questionOrderEfficiencyScore * 100).toFixed(0)}% — time is going to the wrong questions first.`],
    ['QUESTION_SELECTION_TRAINING'],
    'Compare question-order efficiency on the next mock.'
  );
};

// ============================================================
// O. CONFIDENCE-CALIBRATION ISSUE
// ============================================================
export const confidenceCalibrationIssue: Classifier = (ctx) => {
  const withConfidence = getAttempts(ctx).filter((a) => typeof a.studentStatedConfidence === 'number');
  if (withConfidence.length < 3) return null;
  const avgGap =
    withConfidence.reduce((sum, a) => sum + Math.abs((a.studentStatedConfidence as number) - (a.isCorrect ? 1 : 0)), 0) /
    withConfidence.length;
  if (avgGap < 0.4) return null;
  return makeHypothesis(
    'CONFIDENCE_CALIBRATION_ISSUE',
    ctx,
    0.55,
    [`Stated confidence and actual correctness differ by ${(avgGap * 100).toFixed(0)} points on average across ${withConfidence.length} attempts.`],
    ['MICRO_QUIZ'],
    'Track the confidence/correctness gap over the next set of attempts.'
  );
};

// ============================================================
// P. CONCEPT INTERFERENCE
// ============================================================
export const conceptInterference: Classifier = (ctx) => {
  const attempts = getAttempts(ctx);
  const mixed = attempts.filter((a) => (a.mixedConceptSkillIds?.length ?? 0) > 0);
  const isolated = attempts.filter((a) => (a.mixedConceptSkillIds?.length ?? 0) === 0);
  if (mixed.length < 2 || isolated.length === 0) return null;
  const mixedAccuracy = mixed.filter((a) => a.isCorrect).length / mixed.length;
  const isolatedAccuracy = isolated.filter((a) => a.isCorrect).length / isolated.length;
  const gap = isolatedAccuracy - mixedAccuracy;
  if (gap < 0.3) return null;
  const otherSkills = [...new Set(mixed.flatMap((a) => a.mixedConceptSkillIds ?? []))];
  return makeHypothesis(
    'CONCEPT_INTERFERENCE',
    ctx,
    gap >= 0.4 ? 0.75 : 0.55,
    [
      `Accuracy is ${(isolatedAccuracy * 100).toFixed(0)}% when this skill appears alone vs. ${(mixedAccuracy * 100).toFixed(0)}% when mixed with ${otherSkills.join(', ')}.`,
    ],
    ['CONTRASTIVE_PRACTICE'],
    'Re-test accuracy on mixed-concept questions after contrastive practice.',
    [ctx.skillId, ...otherSkills]
  );
};

// ============================================================
// H. QUESTION INTERPRETATION FAILURE
// ============================================================
export const questionInterpretationFailure: Classifier = (ctx) => {
  const clusters = clusterErrors(getAttempts(ctx));
  const cluster = clusters.find((c) => c.patternTag === 'misread-condition');
  if (!cluster || cluster.count < MIN_WRONG_FOR_PATTERN) return null;
  return makeHypothesis(
    'QUESTION_INTERPRETATION_FAILURE',
    ctx,
    0.6,
    [`${cluster.count} wrong attempts show the method was right but a condition in the question was misread.`],
    ['CONTRASTIVE_PRACTICE', 'MICRO_QUIZ'],
    'Watch whether the same misreading recurs on differently-worded questions.'
  );
};

// ============================================================
// I. PROCEDURAL ERROR
// ============================================================
export const proceduralError: Classifier = (ctx) => {
  const clusters = clusterErrors(getAttempts(ctx));
  const cluster = clusters.find((c) => c.patternTag === 'procedure-order-error');
  if (!cluster) return null;
  const traces = getReasoningTraces(ctx);
  const conceptLooksKnown = traces.length === 0 || traces.some((t) => t.stepsCorrect);
  const score = cluster.count >= 3 ? 0.75 : cluster.count >= 2 ? 0.55 : 0.35;
  return makeHypothesis(
    'PROCEDURAL_ERROR',
    ctx,
    score,
    [
      `${cluster.count} wrong attempt(s) show the right idea applied in the wrong order or with a missed step.`,
      ...(conceptLooksKnown ? ['The underlying concept looks understood — this is an execution issue.'] : []),
    ],
    ['PRACTICE'],
    'Guided practice with step-order checks, then an unassisted retry.'
  );
};

// ============================================================
// G. REASONING FAILURE
// ============================================================
export const reasoningFailure: Classifier = (ctx) => {
  const traces = getReasoningTraces(ctx).filter((t) => !t.stepsCorrect);
  if (traces.length < MIN_WRONG_FOR_PATTERN) return null;
  const mastery = getMastery(ctx);
  if (mastery?.neverLearned) return null; // that's a concept gap, not a reasoning failure
  const steps = traces.map((t) => t.brokeDownAtStep).filter(Boolean);
  const sameStep = steps.length > 0 && steps.every((s) => s === steps[0]);
  return makeHypothesis(
    'REASONING_FAILURE',
    ctx,
    sameStep ? 0.75 : 0.55,
    [
      `${traces.length} reasoning traces break down before reaching a correct final answer, despite the concept itself being known.`,
      ...(sameStep && steps[0] ? [`The breakdown consistently happens at: ${steps[0]}.`] : []),
    ],
    ['REASONING_DRILL'],
    'Check whether the same step now completes correctly, unaided.'
  );
};

// ---- registry --------------------------------------------------------

export const CLASSIFIERS: Classifier[] = [
  conceptGap,
  prerequisiteGap,
  retrievalWeakness,
  retentionDecay,
  transferFailure,
  pressurePerformanceDegradation,
  conceptMisunderstanding,
  calculationError,
  carelessError,
  timeEfficiencyIssue,
  questionSelectionIssue,
  confidenceCalibrationIssue,
  conceptInterference,
  questionInterpretationFailure,
  proceduralError,
  reasoningFailure,
];
