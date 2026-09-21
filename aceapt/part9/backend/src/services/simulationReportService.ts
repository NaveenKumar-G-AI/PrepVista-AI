import {
  AnswerRecord,
  DimensionScores,
  Question,
  Simulation,
  SimulationHistoryEntry,
  SimulationInsight,
  SimulationReport,
  SkillId,
} from '../domain/types';
import { Integrations } from '../integrations';
import { getQuestionById } from '../data/questionBank';
import { SimulationRepository } from '../repositories/simulationRepository';
import { ConsistencyAnalyzer } from './consistencyAnalyzer';
import { DecisionTrackingService } from './decisionTrackingService';
import { EnduranceAnalyzer } from './enduranceAnalyzer';
import { ErrorPatternAnalyzer } from './errorPatternAnalyzer';
import { FailureCascadeDetector } from './failureCascadeDetector';
import { NextActionSignalService } from './nextActionSignalService';
import { PerformanceCurveAnalyzer } from './performanceCurveAnalyzer';
import { ReadinessIntegrationService } from './readinessIntegrationService';
import { RecoveryAnalyzer } from './recoveryAnalyzer';
import { SimulationHistoryService } from './simulationHistoryService';
import { SimulationScoringService } from './simulationScoringService';
import { TimeManagementAnalyzer } from './timeManagementAnalyzer';
import { analyzeAnswerChanges, analyzeTopicSwitching } from '../analytics/secondaryInsights';
import { randomUUID } from 'node:crypto';
import { round1 } from '../util/math';
import { Errors } from '../domain/errors';

// ============================================================
// SIMULATION REPORT SERVICE  (spec sections 34, 35, 48, 63)
// ============================================================
// Everything in "no fake intelligence" (spec section 58) lives here:
// every dimension score, insight, and signal below is derived from the
// actual recorded answers/events of THIS simulation. Nothing is
// hardcoded or randomly generated. This is also the only place that
// fires the Feature 3/4/5/6/7 integration calls, and it fires them
// exactly once per completed simulation (see SimulationEngine.complete
// idempotency check).

const scoring = new SimulationScoringService();
const decisionTracking = new DecisionTrackingService();
const timeManagement = new TimeManagementAnalyzer();
const consistency = new ConsistencyAnalyzer();
const recoveryAnalyzer = new RecoveryAnalyzer();
const curveAnalyzer = new PerformanceCurveAnalyzer();
const enduranceAnalyzer = new EnduranceAnalyzer();
const cascadeDetector = new FailureCascadeDetector();
const errorPatternAnalyzer = new ErrorPatternAnalyzer();

export class SimulationReportService {
  private historyService: SimulationHistoryService;
  private readiness: ReadinessIntegrationService;
  private nextActionSignal: NextActionSignalService;

  constructor(private repo: SimulationRepository, private integrations: Integrations) {
    this.historyService = new SimulationHistoryService(repo);
    this.readiness = new ReadinessIntegrationService(integrations.feature6);
    this.nextActionSignal = new NextActionSignalService(integrations.feature7);
  }

  async finalizeAndBuildReport(sim: Simulation): Promise<SimulationReport> {
    const questions = new Map<string, Question>(
      sim.questionRefs.map((ref) => [ref.questionId, getQuestionById(ref.questionId)!]),
    );
    const orderedAnswers: AnswerRecord[] = sim.questionRefs
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((ref) => sim.answers[ref.questionId]);

    // ---- scoring ----
    const rawScore = scoring.computeRawScore(Object.values(sim.answers), sim.questionRefs.length, sim.negativeMarking);
    const speed = scoring.speedScore(Object.values(sim.answers), questions);

    // ---- decision quality ----
    const decisionOutcomes = decisionTracking.classifyAll(Object.values(sim.answers), questions);
    const decisionQuality = decisionTracking.score(decisionOutcomes);

    // ---- time management ----
    const timeManagementScore = timeManagement.score(Object.values(sim.answers), questions);
    const averageTimeRatio = timeManagement.averageTimeRatio(Object.values(sim.answers), questions);

    // ---- consistency ----
    const consistencyScore = consistency.score(sim.questionRefs, sim.answers);

    // ---- recovery ----
    const recoveryFinding = recoveryAnalyzer.analyze(orderedAnswers);
    const recoveryScore = recoveryAnalyzer.score(recoveryFinding);

    // ---- performance curve + endurance ----
    const curve = curveAnalyzer.curve(orderedAnswers);
    const enduranceFinding = enduranceAnalyzer.analyze(curve);
    const enduranceScore = enduranceAnalyzer.score(enduranceFinding);

    const dimensions: DimensionScores = {
      accuracy: rawScore.accuracyPercent,
      speed,
      decisionQuality,
      timeManagement: timeManagementScore,
      consistency: consistencyScore,
      recovery: recoveryScore,
      endurance: enduranceScore,
    };
    const overallScore = scoring.overallScore(dimensions);

    await this.repo.saveResult({
      simulationId: sim.id,
      overallScore,
      dimensions,
      correctCount: rawScore.correctCount,
      wrongCount: rawScore.wrongCount,
      skippedCount: rawScore.skippedCount,
      rawScore: rawScore.rawScore,
      maxScore: rawScore.maxScore,
    });

    // ---- secondary insights ----
    const cascades = cascadeDetector.detect(orderedAnswers, questions);
    const errorClassifications = errorPatternAnalyzer.classifyAll(Object.values(sim.answers), questions);
    const topicSwitch = analyzeTopicSwitching(sim.questionRefs, sim.answers);
    const answerChanges = analyzeAnswerChanges(Object.values(sim.answers));

    const insights = buildInsights({
      recoveryFinding,
      enduranceFinding,
      cascades,
      errorClassifications,
      topicSwitch,
      answerChanges,
      simulationId: sim.id,
    });

    const { topStrengths, topBottlenecks } = summarizeDimensions(dimensions);

    // ---- per-skill accuracy, used by the Feature 4/5 signals below ----
    const perSkillAccuracy = computePerSkillAccuracy(sim);
    const weakestSkill = perSkillAccuracy[0];

    // ---- Feature 6: readiness evidence ----
    await this.readiness.submitEvidence(sim.studentId, sim.id, overallScore, dimensions);

    // ---- Feature 7: next-action signal (spec section 38 shape) ----
    const { nextAction: nextActionLabel } = await this.nextActionSignal.sendWeakestDimensionSignal(
      sim.studentId,
      dimensions,
      { average_time_ratio: averageTimeRatio, late_session_accuracy_drop: round1(Math.max(0, enduranceFinding.accuracyDropPoints) / 100) },
    );

    // ---- Feature 5: trigger training loop on the weakest skill(s) ----
    if (weakestSkill) {
      await this.integrations.feature5.triggerTrainingLoop(sim.studentId, [weakestSkill.skill]);
    }

    // ---- Feature 4: mastery-path signal (spec section 40 shape) ----
    if (weakestSkill) {
      await this.integrations.feature4.submitMasteryPathSignal(
        sim.studentId,
        `${weakestSkill.skill.toUpperCase()}_PERFORMANCE_WEAK`,
        { accuracy: weakestSkill.accuracy, attempted: weakestSkill.attempted },
      );
    }

    // ---- comparison to previous + Feature 3 long-term trend ----
    const previous = await this.historyService.findPrevious(sim.studentId, sim);
    const comparisonToPrevious = previous
      ? this.historyService.buildComparison(previous, sim.id, overallScore, dimensions)
      : null;

    const trend = await this.buildTrendForFeature3(sim.studentId, sim.id, dimensions);
    await this.integrations.feature3.submitLongTermEvidence(sim.studentId, {
      simulationId: sim.id,
      overallScore,
      timeManagementTrend: trend.timeManagementTrend,
      decisionQualityTrend: trend.decisionQualityTrend,
      enduranceTrend: trend.enduranceTrend,
      recoveryTrend: trend.recoveryTrend,
      trajectory: trend.trajectory,
    });

    const report: SimulationReport = {
      simulationId: sim.id,
      studentId: sim.studentId,
      overallScore,
      dimensions,
      correctCount: rawScore.correctCount,
      wrongCount: rawScore.wrongCount,
      skippedCount: rawScore.skippedCount,
      performanceCurve: curve,
      insights,
      topStrengths,
      topBottlenecks,
      nextAction: nextActionLabel ? { source: 'FEATURE_7', label: nextActionLabel } : null,
      comparisonToPrevious,
    };

    await this.repo.saveReport(report);
    return report;
  }

  async getExistingReport(sim: Simulation): Promise<SimulationReport> {
    const report = await this.repo.getReport(sim.id);
    if (!report) throw Errors.simulationNotFound(sim.id);
    return report;
  }

  async getHistory(studentId: string): Promise<SimulationHistoryEntry[]> {
    return this.historyService.getHistory(studentId);
  }

  private async buildTrendForFeature3(studentId: string, currentSimId: string, currentDimensions: DimensionScores) {
    const history = await this.historyService.getHistory(studentId);
    const withCurrent = [...history.filter((h) => h.simulationId !== currentSimId), {
      simulationId: currentSimId,
      completedAt: Date.now(),
      overallScore: 0,
      dimensions: currentDimensions,
    }];

    const timeManagementTrend = withCurrent.map((h) => h.dimensions.timeManagement);
    const decisionQualityTrend = withCurrent.map((h) => h.dimensions.decisionQuality);
    const enduranceTrend = withCurrent.map((h) => h.dimensions.endurance);
    const recoveryTrend = withCurrent.map((h) => h.dimensions.recovery);

    let trajectory: 'IMPROVING' | 'REGRESSING' | 'STABLE' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';
    if (withCurrent.length >= 2) {
      const first = withCurrent[0].dimensions.timeManagement;
      const last = withCurrent.at(-1)!.dimensions.timeManagement;
      if (last - first >= 5) trajectory = 'IMPROVING';
      else if (first - last >= 5) trajectory = 'REGRESSING';
      else trajectory = 'STABLE';
    }

    return { timeManagementTrend, decisionQualityTrend, enduranceTrend, recoveryTrend, trajectory };
  }
}

function summarizeDimensions(dimensions: DimensionScores): { topStrengths: string[]; topBottlenecks: string[] } {
  const entries = Object.entries(dimensions) as [keyof DimensionScores, number][];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const topStrengths = sorted.slice(0, 2).map(([key]) => LABELS[key]);
  const topBottlenecks = sorted
    .slice(-2)
    .reverse()
    .map(([key]) => LABELS[key]);
  return { topStrengths, topBottlenecks };
}

const LABELS: Record<keyof DimensionScores, string> = {
  accuracy: 'Accuracy',
  speed: 'Speed',
  decisionQuality: 'Question selection and decision quality',
  timeManagement: 'Time management',
  consistency: 'Consistency',
  recovery: 'Recovery after mistakes',
  endurance: 'Endurance across the full session',
};

function computePerSkillAccuracy(sim: Simulation): { skill: SkillId; accuracy: number; attempted: number }[] {
  const bySkill = new Map<SkillId, { correct: number; attempted: number }>();
  for (const ref of sim.questionRefs) {
    const answer = sim.answers[ref.questionId];
    if (answer.selectedOptionId === null) continue;
    const bucket = bySkill.get(ref.skill) ?? { correct: 0, attempted: 0 };
    bucket.attempted += 1;
    if (answer.isCorrect) bucket.correct += 1;
    bySkill.set(ref.skill, bucket);
  }
  return [...bySkill.entries()]
    .map(([skill, { correct, attempted }]) => ({
      skill,
      accuracy: round1((correct / attempted) * 100),
      attempted,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

function buildInsights(args: {
  recoveryFinding: ReturnType<RecoveryAnalyzer['analyze']>;
  enduranceFinding: ReturnType<EnduranceAnalyzer['analyze']>;
  cascades: ReturnType<FailureCascadeDetector['detect']>;
  errorClassifications: ReturnType<ErrorPatternAnalyzer['classifyAll']>;
  topicSwitch: ReturnType<typeof analyzeTopicSwitching>;
  answerChanges: ReturnType<typeof analyzeAnswerChanges>;
  simulationId: string;
}): SimulationInsight[] {
  const insights: SimulationInsight[] = [];
  const push = (signalType: string, confidence: number, evidence: Record<string, unknown>, message: string, severity: SimulationInsight['severity']) => {
    insights.push({ id: randomUUID(), simulationId: args.simulationId, signalType, severity, confidence, evidence, message });
  };

  if (args.recoveryFinding.streaks.length > 0) {
    push(
      args.recoveryFinding.detected ? 'RECOVERY_DETECTED' : 'RECOVERY_NOT_DETECTED',
      args.recoveryFinding.detected ? Math.max(0.5, args.recoveryFinding.confidence) : 0.5,
      { streaks: args.recoveryFinding.streaks },
      args.recoveryFinding.detected
        ? 'Recovered well after a run of mistakes - accuracy bounced back within the next few questions.'
        : 'Performance did not clearly recover after a run of mistakes this session.',
      args.recoveryFinding.detected ? 'LOW' : 'MEDIUM',
    );
  }

  if (args.enduranceFinding.status === 'ENDURANCE_DECLINE') {
    push(
      'LATE_SESSION_DECLINE',
      args.enduranceFinding.confidence,
      { accuracyDropPoints: args.enduranceFinding.accuracyDropPoints },
      'Late-session performance decline: accuracy dropped notably from the beginning to the end of the simulation.',
      args.enduranceFinding.confidence >= 0.7 ? 'HIGH' : 'MEDIUM',
    );
  }

  for (const cascade of args.cascades) {
    push(
      cascade.type,
      cascade.confidence,
      cascade.evidence,
      'A question that took much longer than expected was followed by faster, less accurate answers - a possible time-loss cascade.',
      cascade.confidence >= 0.75 ? 'HIGH' : 'MEDIUM',
    );
  }

  if (args.topicSwitch.hasSufficientData) {
    push(
      'TOPIC_SWITCH_EFFECT',
      0.6,
      { switchAccuracy: args.topicSwitch.switchAccuracy, nonSwitchAccuracy: args.topicSwitch.nonSwitchAccuracy },
      args.topicSwitch.message,
      (args.topicSwitch.deltaPoints ?? 0) >= 15 ? 'MEDIUM' : 'LOW',
    );
  }

  if (args.answerChanges.hasSufficientData) {
    push(
      'ANSWER_CHANGE_PATTERN',
      0.5,
      { successCount: args.answerChanges.successCount, totalChanges: args.answerChanges.totalChanges },
      args.answerChanges.message,
      'LOW',
    );
  }

  const errorTypeCounts = new Map<string, number>();
  for (const e of args.errorClassifications) {
    errorTypeCounts.set(e.type, (errorTypeCounts.get(e.type) ?? 0) + 1);
  }
  if (errorTypeCounts.size > 0) {
    const [dominantType, count] = [...errorTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    push(
      'DOMINANT_ERROR_PATTERN',
      Math.min(0.6, 0.3 + count * 0.05),
      { breakdown: Object.fromEntries(errorTypeCounts), totalErrors: args.errorClassifications.length },
      `Most incorrect answers this session were classified as ${dominantType.replace(/_/g, ' ')}.`,
      'LOW',
    );
  }

  return insights;
}
