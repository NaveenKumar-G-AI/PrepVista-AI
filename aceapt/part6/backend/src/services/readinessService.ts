import {
  AnswerChangeInsight,
  Difficulty,
  DifficultyPerformancePoint,
  Domain,
  Readiness,
  ReadinessConfidence,
  ReadinessDimension,
  ReadinessDimensionScore,
  SkillPerformance,
  SkipStrategyInsight,
  TimeAnalysis,
  Topic,
} from '../domain/types';
import {
  CONFIDENCE_RULES,
  DIMENSION_WEIGHTS,
  PRESSURE_GAP_PENALTY_THRESHOLD_PCT,
  DIFFICULTY_DROP_PENALTY_THRESHOLD_PCT,
  READINESS_MODEL_VERSION,
  UNSCORED_DIMENSION_DEFAULT,
  scoreToState,
} from '../config/readinessModel';
import { ScoredAttempt } from './scoringService';
import { computeConsistency } from './consistencyService';
import { getReadinessHistory } from './historyService';
import { feature5Adapter } from '../adapters/feature5Adapter';
import { nowIso } from '../utils/ids';

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

(function assertWeightsValid() {
  const total = Object.values(DIMENSION_WEIGHTS).reduce((s, w) => s + w, 0);
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`DIMENSION_WEIGHTS in config/readinessModel.ts must sum to 1.0, got ${total}`);
  }
})();

interface DimRaw {
  score: number;
  scored: boolean;
  explanation: string;
}

function topicAccuracy(scoredAttempts: ScoredAttempt[], topic: Topic): { accuracyPct: number; count: number } | null {
  const group = scoredAttempts.filter((sa) => sa.question.topic === topic && sa.answered);
  if (group.length === 0) return null;
  return { accuracyPct: Math.round((group.filter((g) => g.correct).length / group.length) * 1000) / 10, count: group.length };
}

/** Below this many answered questions on a topic, per-topic accuracy is too noisy to compare against
 *  practice accuracy - a single missed question out of one or two can look like a catastrophic gap
 *  that isn't really there. Mirrors the evidence-sufficiency principle used elsewhere (section 23/32). */
const MIN_QUESTIONS_FOR_PRESSURE_COMPARISON = 3;

function dimAccuracy(accuracyPct: number): DimRaw {
  return { score: accuracyPct, scored: true, explanation: `Overall accuracy this attempt: ${accuracyPct}%.` };
}

function dimSpeed(scoredAttempts: ScoredAttempt[], unansweredDueToTime: number): DimRaw {
  const answered = scoredAttempts.filter((sa) => sa.answered);
  if (answered.length === 0) {
    return { score: UNSCORED_DIMENSION_DEFAULT, scored: false, explanation: 'No answered questions to measure pacing from.' };
  }
  const efficiencies = answered.map((sa) =>
    Math.min(1, sa.question.expectedTimeSeconds / Math.max(1, sa.attempt.timeSpentMs / 1000))
  );
  const avgEff = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
  const score = clamp(avgEff * 100 - Math.min(20, unansweredDueToTime * 4));
  return {
    score: Math.round(score),
    scored: true,
    explanation: `Average pacing efficiency ${Math.round(avgEff * 100)}% of expected time per question, with ${unansweredDueToTime} question(s) unreached due to time.`,
  };
}

function dimTimeManagement(timeAnalysis: TimeAnalysis, questionCount: number): DimRaw {
  if (questionCount === 0) return { score: UNSCORED_DIMENSION_DEFAULT, scored: false, explanation: 'No questions to analyze.' };
  const overCount = timeAnalysis.overInvestmentFlags.length;
  const underCount = timeAnalysis.underInvestmentFlags.length;
  const penalty = overCount * 8 + underCount * 4 + timeAnalysis.unansweredDueToTime * 6;
  const score = clamp(100 - penalty);
  return {
    score: Math.round(score),
    scored: true,
    explanation: `${overCount} question(s) over-invested, ${underCount} under-invested, ${timeAnalysis.unansweredDueToTime} unreached due to time.`,
  };
}

function dimConceptStability(skillPerformance: SkillPerformance[]): DimRaw {
  const withData = skillPerformance.filter((s) => s.label !== 'INSUFFICIENT_DATA');
  // Same rationale as the pressure-gap guard above: with only 1-2 skills carrying enough attempts to
  // count, a single skill's label swings this between 0% and 100% on noise, not signal.
  if (withData.length < 3) {
    return {
      score: UNSCORED_DIMENSION_DEFAULT,
      scored: false,
      explanation: `Only ${withData.length} skill(s) had enough attempts this assessment to judge concept stability - not enough breadth yet for a reliable signal.`,
    };
  }
  const stableCount = withData.filter((s) => s.label === 'STABLE' || s.label === 'STRONG').length;
  const score = (stableCount / withData.length) * 100;
  return {
    score: Math.round(score),
    scored: true,
    explanation: `${stableCount}/${withData.length} tested skills are performing at a stable-or-better level.`,
  };
}

function dimDifficultyStability(curve: DifficultyPerformancePoint[]): DimRaw {
  const points = curve.filter((p): p is DifficultyPerformancePoint & { accuracyPct: number } => p.accuracyPct !== null);
  if (points.length < 2) {
    return { score: UNSCORED_DIMENSION_DEFAULT, scored: false, explanation: 'Not enough difficulty tiers attempted yet to judge stability across difficulty.' };
  }
  let penalty = 0;
  for (let i = 1; i < points.length; i += 1) {
    const drop = points[i - 1].accuracyPct - points[i].accuracyPct;
    if (drop > DIFFICULTY_DROP_PENALTY_THRESHOLD_PCT) penalty += drop - DIFFICULTY_DROP_PENALTY_THRESHOLD_PCT;
  }
  const score = clamp(100 - penalty);
  return {
    score: Math.round(score),
    scored: true,
    explanation: `Accuracy across difficulty tiers: ${points.map((p) => `${p.difficulty} ${p.accuracyPct}%`).join(', ')}.`,
  };
}

export interface PressureGapResult {
  available: boolean;
  practiceAccuracyPct: number | null;
  assessmentAccuracyPct: number;
  gapPct: number | null;
  note: string;
}

/**
 * Compares practice accuracy against assessment accuracy on the SAME topics
 * only (not practice-on-X vs overall-exam-accuracy-across-everything) - an
 * apples-to-oranges comparison would quietly undermine the one thing this
 * dimension is supposed to be honest about (section 24/25).
 */
export async function computePressureGap(
  studentId: string,
  scoredAttempts: ScoredAttempt[],
  overallAccuracyPctFallback: number
): Promise<PressureGapResult> {
  const topics = [...new Set(scoredAttempts.map((sa) => sa.question.topic))];
  const samples = await Promise.all(topics.map((t) => feature5Adapter.getPracticeAccuracy(studentId, t)));

  const comparable = topics
    .map((topic, i) => ({ topic, practice: samples[i], assessmentSide: topicAccuracy(scoredAttempts, topic) }))
    .filter(
      (c): c is { topic: Topic; practice: NonNullable<typeof c.practice>; assessmentSide: { accuracyPct: number; count: number } } =>
        c.practice !== null && c.practice.sampleSize > 0 && c.assessmentSide !== null && c.assessmentSide.count >= MIN_QUESTIONS_FOR_PRESSURE_COMPARISON
    );

  if (comparable.length === 0) {
    const hadTopicMatchButTooFewQuestions = topics.some((t, i) => samples[i] !== null && samples[i]!.sampleSize > 0);
    return {
      available: false,
      practiceAccuracyPct: null,
      assessmentAccuracyPct: overallAccuracyPctFallback,
      gapPct: null,
      note: hadTopicMatchButTooFewQuestions
        ? `Practice history exists for a matching topic, but this assessment answered fewer than ${MIN_QUESTIONS_FOR_PRESSURE_COMPARISON} questions on it - too little evidence this attempt for a reliable comparison.`
        : 'No comparable Feature 5 practice history yet for the topics in this assessment - the practice-vs-assessment gap will appear once practice data exists.',
    };
  }

  const totalSamples = comparable.reduce((s, c) => s + c.practice.sampleSize, 0);
  const practiceAccuracyPct =
    Math.round((comparable.reduce((s, c) => s + c.practice.accuracyPct * c.practice.sampleSize, 0) / totalSamples) * 10) / 10;
  // Weight the matched assessment-side accuracy the same way, so both sides describe the same topic mix.
  const assessmentAccuracyPct =
    Math.round((comparable.reduce((s, c) => s + c.assessmentSide.accuracyPct * c.practice.sampleSize, 0) / totalSamples) * 10) / 10;
  const gapPct = Math.round((practiceAccuracyPct - assessmentAccuracyPct) * 10) / 10;

  const topicList = comparable.map((c) => c.topic.replace(/_/g, ' ').toLowerCase()).join(', ');
  const note =
    gapPct > PRESSURE_GAP_PENALTY_THRESHOLD_PCT
      ? `Practice accuracy (${practiceAccuracyPct}%) is notably higher than assessment accuracy (${assessmentAccuracyPct}%) on the same topic(s) (${topicList}) - performance is dropping under timed, mixed conditions.`
      : gapPct < -PRESSURE_GAP_PENALTY_THRESHOLD_PCT
        ? `Assessment accuracy (${assessmentAccuracyPct}%) is higher than practice accuracy (${practiceAccuracyPct}%) on the same topic(s) (${topicList}) - performance is holding up well, or even improving, under real conditions.`
        : `Practice (${practiceAccuracyPct}%) and assessment (${assessmentAccuracyPct}%) accuracy are close on the same topic(s) (${topicList}) - no meaningful pressure gap detected.`;

  return { available: true, practiceAccuracyPct, assessmentAccuracyPct, gapPct, note };
}

function dimExamPressure(gap: PressureGapResult): DimRaw {
  if (!gap.available || gap.gapPct === null) {
    return { score: UNSCORED_DIMENSION_DEFAULT, scored: false, explanation: gap.note };
  }
  const penalty = Math.max(0, gap.gapPct - PRESSURE_GAP_PENALTY_THRESHOLD_PCT) * 2;
  return { score: Math.round(clamp(100 - penalty)), scored: true, explanation: gap.note };
}

function dimQuestionSelection(skip: SkipStrategyInsight): DimRaw {
  let score = 100 - skip.trappedCount * 15;
  if (skip.overAggressiveSkipping) score -= 15;
  if (skip.neverSkipsDespiteStruggle) score -= 10;
  score += Math.min(10, skip.effectiveSkips * 5);
  return { score: Math.round(clamp(score)), scored: true, explanation: skip.insightText };
}

function dimStrategyEffectiveness(
  questionSelectionScore: number,
  timeManagementScore: number,
  answerChange: AnswerChangeInsight
): DimRaw {
  let changeScore = 100;
  if (answerChange.hasSufficientEvidence) {
    changeScore = clamp(100 - Math.max(0, answerChange.correctToWrong - answerChange.wrongToCorrect) * 10);
  }
  const score = Math.round((questionSelectionScore + timeManagementScore + changeScore) / 3);
  return {
    score,
    scored: true,
    explanation: `Blend of question-selection quality, time management, and answer-change quality.`,
  };
}

export interface ReadinessInputs {
  studentId: string;
  scoredAttempts: ScoredAttempt[];
  accuracyPct: number;
  timeAnalysis: TimeAnalysis;
  skillPerformance: SkillPerformance[];
  difficultyCurve: DifficultyPerformancePoint[];
  answerChangeInsight: AnswerChangeInsight;
  skipStrategyInsight: SkipStrategyInsight;
}

export async function computeReadiness(inputs: ReadinessInputs): Promise<{ readiness: Readiness; pressureGap: PressureGapResult }> {
  const {
    studentId,
    scoredAttempts,
    accuracyPct,
    timeAnalysis,
    skillPerformance,
    difficultyCurve,
    answerChangeInsight,
    skipStrategyInsight,
  } = inputs;

  const accuracy = dimAccuracy(accuracyPct);
  const speed = dimSpeed(scoredAttempts, timeAnalysis.unansweredDueToTime);
  const timeManagement = dimTimeManagement(timeAnalysis, scoredAttempts.length);
  const conceptStability = dimConceptStability(skillPerformance);
  const difficultyStability = dimDifficultyStability(difficultyCurve);
  const pressureGap = await computePressureGap(studentId, scoredAttempts, accuracyPct);
  const examPressure = dimExamPressure(pressureGap);
  const questionSelection = dimQuestionSelection(skipStrategyInsight);

  const consistency = computeConsistency(studentId, /* placeholder, corrected below */ accuracyPct);
  // Consistency actually tracks OVERALL READINESS scores, not raw accuracy - but overall readiness
  // depends on consistency (circular). We approximate using accuracy as a same-scale proxy for THIS
  // attempt's contribution to the trend, then still store the real overall score into history after
  // this function returns (see routes/services/assessmentReportOrchestration). This keeps the model
  // a strict one-pass computation instead of an unstable fixed point.
  const consistencyDim: DimRaw = consistency.scored
    ? { score: consistency.score as number, scored: true, explanation: consistency.explanation }
    : { score: UNSCORED_DIMENSION_DEFAULT, scored: false, explanation: consistency.explanation };

  const strategyEffectiveness = dimStrategyEffectiveness(questionSelection.score, timeManagement.score, answerChangeInsight);

  const dims: Record<ReadinessDimension, DimRaw> = {
    ACCURACY: accuracy,
    SPEED: speed,
    CONSISTENCY: consistencyDim,
    TIME_MANAGEMENT: timeManagement,
    CONCEPT_STABILITY: conceptStability,
    DIFFICULTY_STABILITY: difficultyStability,
    EXAM_PRESSURE_PERFORMANCE: examPressure,
    QUESTION_SELECTION: questionSelection,
    STRATEGY_EFFECTIVENESS: strategyEffectiveness,
  };

  const overallScore = Math.round(
    (Object.keys(DIMENSION_WEIGHTS) as ReadinessDimension[]).reduce(
      (sum, dim) => sum + dims[dim].score * DIMENSION_WEIGHTS[dim],
      0
    )
  );

  const state = scoreToState(overallScore);
  const { confidence, reason } = computeConfidence(studentId, scoredAttempts.map((sa) => sa.question.topic));

  const sectionReadiness = (['QUANTITATIVE', 'LOGICAL', 'VERBAL'] as Domain[])
    .map((domain) => {
      const group = scoredAttempts.filter((sa) => sa.question.domain === domain && sa.answered);
      if (group.length === 0) return null;
      const score = Math.round((group.filter((g) => g.correct).length / group.length) * 100);
      return { domain, score };
    })
    .filter((x): x is { domain: Domain; score: number } => x !== null);

  const dimensionScores: ReadinessDimensionScore[] = (Object.keys(dims) as ReadinessDimension[]).map((dimension) => ({
    dimension,
    score: dims[dimension].score,
    scored: dims[dimension].scored,
    explanation: dims[dimension].explanation,
  }));

  const readiness: Readiness = {
    modelVersion: READINESS_MODEL_VERSION,
    overallScore,
    state,
    confidence,
    confidenceReason: reason,
    dimensions: dimensionScores,
    sectionReadiness,
    computedAt: nowIso(),
  };

  return { readiness, pressureGap };
}

function computeConfidence(studentId: string, currentTopics: Topic[]): { confidence: ReadinessConfidence; reason: string } {
  const history = getReadinessHistory(studentId, 200);
  const totalAssessments = history.length + 1;

  const topicCounts = new Map<Topic, number>();
  for (const h of history) for (const t of h.topicsCovered) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  for (const t of currentTopics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  const topicsCoveredTwice = [...topicCounts.values()].filter((c) => c >= 2).length;

  if (totalAssessments >= CONFIDENCE_RULES.HIGH.minAssessments && topicsCoveredTwice >= CONFIDENCE_RULES.HIGH.minTopicsCoveredTwice) {
    return {
      confidence: 'HIGH',
      reason: `${totalAssessments} assessments completed, with ${topicsCoveredTwice} topics tested at least twice - readiness is backed by broad, repeated evidence.`,
    };
  }
  if (
    totalAssessments >= CONFIDENCE_RULES.MEDIUM.minAssessments &&
    topicsCoveredTwice >= CONFIDENCE_RULES.MEDIUM.minTopicsCoveredTwice
  ) {
    return {
      confidence: 'MEDIUM',
      reason: `${totalAssessments} assessments completed, with ${topicsCoveredTwice} topics tested at least twice - a reasonable but still-growing evidence base.`,
    };
  }
  return {
    confidence: 'LOW',
    reason: `Only ${totalAssessments} assessment${totalAssessments === 1 ? '' : 's'} completed so far - this readiness score could shift as more evidence comes in.`,
  };
}
