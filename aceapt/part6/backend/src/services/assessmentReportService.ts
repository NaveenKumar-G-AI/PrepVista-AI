import { getDb, toJson, fromJson } from '../db/db';
import { AssessmentResult, Diagnosis, ErrorType, RiskArea } from '../domain/types';
import { nowIso } from '../utils/ids';
import { PRESSURE_GAP_PENALTY_THRESHOLD_PCT } from '../config/readinessModel';

import { finalizeOpenIntervals } from './attemptService';
import { scoreAssessment, ScoredAttempt } from './scoringService';
import { analyzeTime } from './timeAnalysisService';
import { computeSkillPerformance, computeDifficultyCurve, classifyErrors } from './skillErrorAnalysisService';
import { analyzeAnswerChanges, analyzeSkipStrategy } from './strategyAnalysisService';
import { computeReadiness } from './readinessService';
import { buildRecommendations, handOffTopRecommendation } from './recommendationService';
import { getOwnedAssessment, markCompleted } from './sessionService';
import { recordReadinessHistory } from './historyService';
import { audit } from '../utils/logger';
import { TimeAnalysis, SkillPerformance } from '../domain/types';

function severityRank(sev: RiskArea['severity']): number {
  return sev === 'HIGH' ? 2 : sev === 'MEDIUM' ? 1 : 0;
}

function computeRiskAreas(
  scoredAttempts: ScoredAttempt[],
  skillPerformance: SkillPerformance[],
  errorClassifications: { questionId: string; errorType: ErrorType }[],
  timeAnalysis: TimeAnalysis
): RiskArea[] {
  const risky = skillPerformance.filter((s) => s.label === 'CRITICAL' || s.label === 'RISK');
  const overInvestedIds = new Set(timeAnalysis.overInvestmentFlags.map((f) => f.questionId));
  const underInvestedIds = new Set(timeAnalysis.underInvestmentFlags.map((f) => f.questionId));
  const errorByQuestion = new Map(errorClassifications.map((e) => [e.questionId, e.errorType]));

  const risks: RiskArea[] = risky.map((s) => {
    const questionsForSkill = scoredAttempts.filter((sa) => sa.question.skill === s.skill && sa.question.topic === s.topic);
    const errorCounts = new Map<ErrorType, number>();
    for (const sa of questionsForSkill) {
      const type = errorByQuestion.get(sa.question.id);
      if (type) errorCounts.set(type, (errorCounts.get(type) ?? 0) + 1);
    }
    let dominantErrorType: ErrorType | undefined;
    let max = 0;
    for (const [type, count] of errorCounts) {
      if (count > max) {
        max = count;
        dominantErrorType = type;
      }
    }
    const timeRelated =
      questionsForSkill.some((sa) => overInvestedIds.has(sa.question.id) || underInvestedIds.has(sa.question.id)) ||
      dominantErrorType === 'TIME_PRESSURE';

    return {
      domain: s.domain,
      topic: s.topic,
      skill: s.skill,
      severity: s.label === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      reason: `${s.accuracyPct}% accuracy on ${s.skill.replace(/-/g, ' ')} across ${s.attempted} question(s) this attempt${
        dominantErrorType ? `, with errors leaning ${dominantErrorType.replace(/_/g, ' ').toLowerCase()}` : ''
      }.`,
      dominantErrorType,
      timeRelated,
    };
  });

  return risks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function buildDiagnosis(args: {
  scoredAttempts: ScoredAttempt[];
  timeAnalysis: TimeAnalysis;
  skillPerformance: SkillPerformance[];
  difficultyCurve: ReturnType<typeof computeDifficultyCurve>;
  riskAreas: RiskArea[];
  readiness: Awaited<ReturnType<typeof computeReadiness>>['readiness'];
  answerChangeInsight: ReturnType<typeof analyzeAnswerChanges>;
  skipStrategyInsight: ReturnType<typeof analyzeSkipStrategy>;
  pressureGap: Awaited<ReturnType<typeof computeReadiness>>['pressureGap'];
  recommendations: ReturnType<typeof buildRecommendations>;
}): Diagnosis {
  const { timeAnalysis, skillPerformance, difficultyCurve, riskAreas, readiness, answerChangeInsight, skipStrategyInsight, pressureGap, recommendations } = args;

  const whatWentWell: string[] = [];
  const strong = [...skillPerformance]
    .filter((s) => s.label === 'STRONG' || s.label === 'STABLE')
    .sort((a, b) => b.accuracyPct - a.accuracyPct)
    .slice(0, 2);
  for (const s of strong) whatWentWell.push(`Strong performance on ${s.skill.replace(/-/g, ' ')} (${s.accuracyPct}% accuracy).`);
  const goodHardDiff = difficultyCurve.find(
    (p) => p.accuracyPct !== null && p.accuracyPct >= 65 && (p.difficulty === 'HARD' || p.difficulty === 'MEDIUM_PLUS')
  );
  if (goodHardDiff) {
    whatWentWell.push(`Held ${goodHardDiff.accuracyPct}% accuracy even on ${goodHardDiff.difficulty.replace('_', ' ').toLowerCase()} questions.`);
  }
  if (timeAnalysis.overInvestmentFlags.length === 0) whatWentWell.push('No single question consumed a disproportionate share of the available time.');
  if (skipStrategyInsight.effectiveSkips > 0) whatWentWell.push(skipStrategyInsight.insightText);
  if (whatWentWell.length === 0) whatWentWell.push('Completed the assessment end-to-end, which is itself useful evidence to build on.');

  const whatWentWrong: string[] = [];
  for (const r of riskAreas.slice(0, 3)) whatWentWrong.push(r.reason);
  if (timeAnalysis.overInvestmentFlags.length > 0) whatWentWrong.push(`${timeAnalysis.overInvestmentFlags.length} question(s) took far longer than expected relative to their difficulty.`);
  if (timeAnalysis.unansweredDueToTime > 0) whatWentWrong.push(`${timeAnalysis.unansweredDueToTime} question(s) were never reached before time ran out.`);
  if (answerChangeInsight.hasSufficientEvidence && answerChangeInsight.netEffect < 0 && answerChangeInsight.insightText) {
    whatWentWrong.push(answerChangeInsight.insightText);
  }
  if (whatWentWrong.length === 0) whatWentWrong.push('No significant weaknesses stood out this attempt.');

  const why: string[] = [];
  if (pressureGap.available && pressureGap.gapPct !== null && pressureGap.gapPct > PRESSURE_GAP_PENALTY_THRESHOLD_PCT) {
    why.push(pressureGap.note);
  }
  const timeRelatedRiskCount = riskAreas.filter((r) => r.timeRelated).length;
  if (timeRelatedRiskCount > 0) {
    why.push(`${timeRelatedRiskCount} of the risk area(s) above show a time-related error pattern rather than a pure concept gap - see the time-management dimension for detail.`);
  }
  const conceptGapRisks = riskAreas.filter((r) => r.dominantErrorType === 'CONCEPT_GAP');
  if (conceptGapRisks.length > 0) {
    why.push(`${conceptGapRisks.map((r) => (r.skill ?? r.topic).replace(/-/g, ' ')).join(', ')} show a concept-gap pattern specifically - these are not just timing issues.`);
  }
  if (why.length === 0) why.push('Performance this attempt is broadly consistent with the skill and time-management signals described above, without one dominant underlying cause.');

  const biggestRisk =
    riskAreas.length > 0
      ? `${(riskAreas[0].skill ?? riskAreas[0].topic).replace(/-/g, ' ')} (${riskAreas[0].domain.toLowerCase()})`
      : timeAnalysis.overInvestmentFlags.length > 0
        ? 'Time management under pressure'
        : 'No major risk identified this attempt';

  const whatToFixFirst =
    riskAreas.length > 0
      ? `${(riskAreas[0].skill ?? riskAreas[0].topic).replace(/-/g, ' ')} - ${riskAreas[0].reason}`
      : timeAnalysis.overInvestmentFlags.length > 0
        ? 'Time sunk into a small number of difficult questions at the cost of the rest of the paper.'
        : 'No urgent fix identified this attempt - focus on maintaining consistency across more assessments.';

  const whatToPracticeNext = recommendations.length > 0 ? recommendations[0].objective : 'Continue with broad mixed practice and reassess.';

  const whenToReassess =
    readiness.confidence === 'LOW'
      ? 'After completing the recommended practice, take at least one more assessment - current readiness confidence is LOW, so more evidence will sharpen this picture.'
      : 'After completing the recommended practice, retake an equivalent assessment to confirm the improvement holds under timed conditions.';

  return { whatWentWell, whatWentWrong, why, biggestRisk, whatToFixFirst, whatToPracticeNext, whenToReassess };
}

export interface GenerateResultOutcome {
  result: AssessmentResult;
  practiceSessionId: string | null;
  warnings: string[];
}

/**
 * The full section-6 loop condensed into one function call:
 * ATTEMPT ANALYSIS -> TIME ANALYSIS -> SKILL ANALYSIS -> ERROR ANALYSIS ->
 * READINESS ENGINE -> PERSONALIZED DIAGNOSIS -> NEXT-BEST ACTION -> (hand off to) FEATURE 5.
 * Idempotent per assessment - calling it twice recomputes and overwrites, it does not double-count.
 */
export async function generateAssessmentResult(assessmentId: string, studentId: string): Promise<GenerateResultOutcome> {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  finalizeOpenIntervals(assessmentId, assessment.currentQuestionId);

  const scoringSummary = scoreAssessment(assessmentId, studentId);
  const timeAnalysis = analyzeTime(assessment, scoringSummary.scoredAttempts);
  const skillPerformance = computeSkillPerformance(scoringSummary.scoredAttempts);
  const difficultyCurve = computeDifficultyCurve(scoringSummary.scoredAttempts);
  const errorClassifications = classifyErrors(scoringSummary.scoredAttempts, skillPerformance);
  const answerChangeInsight = analyzeAnswerChanges(scoringSummary.scoredAttempts);
  const skipStrategyInsight = analyzeSkipStrategy(scoringSummary.scoredAttempts, timeAnalysis.overInvestmentFlags);

  const { readiness, pressureGap } = await computeReadiness({
    studentId,
    scoredAttempts: scoringSummary.scoredAttempts,
    accuracyPct: scoringSummary.accuracyPct,
    timeAnalysis,
    skillPerformance,
    difficultyCurve,
    answerChangeInsight,
    skipStrategyInsight,
  });

  const riskAreas = computeRiskAreas(scoringSummary.scoredAttempts, skillPerformance, errorClassifications, timeAnalysis);
  const recommendations = buildRecommendations(riskAreas, skillPerformance);
  const diagnosis = buildDiagnosis({
    scoredAttempts: scoringSummary.scoredAttempts,
    timeAnalysis,
    skillPerformance,
    difficultyCurve,
    riskAreas,
    readiness,
    answerChangeInsight,
    skipStrategyInsight,
    pressureGap,
    recommendations,
  });

  const result: AssessmentResult = {
    assessmentId,
    studentId,
    scoredAt: nowIso(),
    rawScore: scoringSummary.rawScore,
    maxScore: scoringSummary.maxScore,
    accuracyPct: scoringSummary.accuracyPct,
    attemptedCount: scoringSummary.attemptedCount,
    correctCount: scoringSummary.correctCount,
    incorrectCount: scoringSummary.incorrectCount,
    unansweredCount: scoringSummary.unansweredCount,
    skillPerformance,
    difficultyCurve,
    timeAnalysis,
    errorClassifications,
    answerChangeInsight,
    skipStrategyInsight,
    practiceVsAssessmentGap: pressureGap,
    readiness,
    riskAreas,
    recommendations,
    diagnosis,
  };

  const db = getDb();
  db.prepare(
    `INSERT INTO assessment_results (assessment_id, student_id, result_json, overall_readiness_score, readiness_state, scored_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(assessment_id) DO UPDATE SET
       result_json = excluded.result_json, overall_readiness_score = excluded.overall_readiness_score,
       readiness_state = excluded.readiness_state, scored_at = excluded.scored_at`
  ).run(assessmentId, studentId, toJson(result), readiness.overallScore, readiness.state, result.scoredAt);

  recordReadinessHistory({
    studentId,
    assessmentId,
    assessmentType: assessment.type,
    overallScore: readiness.overallScore,
    accuracyPct: scoringSummary.accuracyPct,
    state: readiness.state,
    modelVersion: readiness.modelVersion,
    topicsCovered: [...new Set(scoringSummary.scoredAttempts.map((sa) => sa.question.topic))],
    computedAt: result.scoredAt,
  });

  markCompleted(assessmentId);
  audit('ASSESSMENT_SCORED', studentId, { assessmentId, overallReadiness: readiness.overallScore, state: readiness.state });

  const handle = await handOffTopRecommendation(studentId, assessmentId, recommendations);

  return { result, practiceSessionId: handle?.practiceSessionId ?? null, warnings: [] };
}

export function getStoredResult(assessmentId: string, studentId: string): AssessmentResult | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT result_json FROM assessment_results WHERE assessment_id = ? AND student_id = ?`)
    .get(assessmentId, studentId) as { result_json: string } | undefined;
  return row ? fromJson<AssessmentResult>(row.result_json, null as any) : null;
}
