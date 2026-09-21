import { THRESHOLDS } from '../config/thresholds';
import { EvidenceBundle, Forecast, ForecastEvidenceItem, FalseMasterySignal } from '../types';
import { classifyTrajectory } from './trajectoryService';
import { analyzeMomentum } from './momentumAnalyzer';
import { detectRegression } from './regressionDetector';
import { classifyVolatility } from './volatilityService';
import { detectFalseMastery } from './falseMasteryDetector';
import { computeConfidence } from './confidenceEngine';
import { detectBottlenecks, BottleneckInput } from './bottleneckEngine';
import { detectRisks } from './riskEngine';
import { assessTargetReadiness } from './targetReadinessService';
import { daysBetween } from './mathUtils';

const MODEL_VERSION = 'feature10-deterministic-core-v0.1';

/**
 * SS34 Forecast Engine Architecture.
 * Orchestrates every deterministic sub-engine below, then hands only
 * the *explanation* (not the numbers) to the AI layer in api/routes.ts.
 * This function never lets anything downstream mutate predictedValue,
 * confidence, or any stored metric - see SS35 Deterministic Core and
 * SS52 Security ("Never allow client-side modification of forecast
 * values").
 */
export function generateForecast(evidence: EvidenceBundle, now: Date = new Date()): Forecast {
  const readinessHistory = evidence.readinessHistory;
  const evidenceCount =
    readinessHistory.length +
    Object.values(evidence.skillHistory).reduce((s, arr) => s + arr.length, 0) +
    evidence.interventionHistory.length;

  // SS39 Cold Start - do not forecast aggressively with almost nothing to go on.
  if (readinessHistory.length < THRESHOLDS.trajectory.minPointsForTrend) {
    return buildInsufficientEvidenceForecast(evidence, evidenceCount, now);
  }

  const overallTrajectory = classifyTrajectory(readinessHistory, 'readiness');
  const overallMomentum = analyzeMomentum(readinessHistory, 'readiness');
  detectRegression(readinessHistory, 'readiness', {
    daysSinceLastActive: evidence.lastActiveAt ? daysBetween(new Date(evidence.lastActiveAt), now) : null,
    retrievalDeclineDetected: evidence.retrievalDeclineDetected,
  });
  const overallVolatility = classifyVolatility(readinessHistory.map((p) => p.value));

  const skillEntries = Object.entries(evidence.skillHistory);
  const bottleneckInputs: BottleneckInput[] = skillEntries.map(([skill, points]) => {
    const latest = points[points.length - 1]?.value ?? 50;
    return {
      skill,
      weaknessSeverity: Math.max(0, 100 - latest),
      simulationTimeCostRatio: evidence.simulationTimeRatios[skill] ?? 1.0,
      downstreamAccuracyEffect: estimateDownstreamEffect(evidence.simulationTimeRatios[skill]),
    };
  });
  const bottlenecks = detectBottlenecks(bottleneckInputs);

  const falseMasterySignals: FalseMasterySignal[] = skillEntries
    .map(([skill]) =>
      detectFalseMastery(
        skill,
        evidence.practiceScores[skill] ?? null,
        evidence.transferScores[skill] ?? null,
        evidence.simulationScores[skill] ?? null
      )
    )
    .filter((s): s is FalseMasterySignal => !!s && s.detected);

  const simTimeRatios = Object.values(evidence.simulationTimeRatios);
  const avgTimeRatio = simTimeRatios.length ? avg(simTimeRatios) : null;

  const risks = detectRisks({
    studentId: evidence.studentId,
    averageSimulationTimeRatio: avgTimeRatio,
    lateSessionDeclineRatio: evidence.lateSessionDeclineRatio,
    retentionGapDays: evidence.retentionGapDays,
    retrievalDeclineDetected: evidence.retrievalDeclineDetected,
    simulationCount: Object.keys(evidence.simulationScores).length,
    mildAccuracyDeclineDetected: overallTrajectory.state === 'SLOWING',
    responseTimeIncreaseDetected: (avgTimeRatio ?? 1) > 1.05,
  });

  const confidence = computeConfidence({
    evidenceCount,
    mostRecentEvidenceDaysAgo: evidence.lastActiveAt ? daysBetween(new Date(evidence.lastActiveAt), now) : null,
    volatilityCV: null,
    distinctSkillsCovered: skillEntries.length,
    expectedSkillsCovered: Math.max(skillEntries.length, 5),
  });

  const confidenceIsSufficient = confidence.level === 'HIGH' || confidence.level === 'MEDIUM';

  const currentReadiness = readinessHistory[readinessHistory.length - 1]?.value ?? null;

  const targetStatus = assessTargetReadiness({
    currentReadiness,
    targetScore: evidence.target?.targetScore ?? 100,
    targetDate: evidence.target?.targetDate ?? null,
    trajectoryState: overallTrajectory.state,
    slopePerWeek: overallTrajectory.slopePerWeek,
    confidenceIsSufficient,
  });

  const predictedValue =
    currentReadiness !== null && overallTrajectory.slopePerWeek !== null
      ? Number(Math.min(100, Math.max(0, currentReadiness + overallTrajectory.slopePerWeek)).toFixed(1))
      : currentReadiness;

  const evidenceItems = buildEvidenceItems(evidence, overallTrajectory, bottlenecks, risks);

  const forecast: Forecast = {
    studentId: evidence.studentId,
    targetId: evidence.target?.id ?? null,
    type: 'READINESS_FORECAST',
    status: 'GENERATED',
    predictedValue,
    confidence: confidence.level,
    confidenceScore: confidence.score,
    evidenceCount,
    dataWindow: overallTrajectory.window,
    modelVersion: MODEL_VERSION,
    trajectory: overallTrajectory.state,
    momentum: overallMomentum.state,
    volatility: overallVolatility,
    targetStatus: targetStatus.status,
    estimatedWeeksToTarget: targetStatus.estimatedWeeksToTarget,
    bottlenecks,
    risks,
    falseMasterySignals,
    evidence: evidenceItems,
    explanation: null, // filled by AIExplanationService, SS58 - never computed here
    createdAt: now.toISOString(),
  };

  return forecast;
}

function buildInsufficientEvidenceForecast(evidence: EvidenceBundle, evidenceCount: number, now: Date): Forecast {
  return {
    studentId: evidence.studentId,
    targetId: evidence.target?.id ?? null,
    type: 'READINESS_FORECAST',
    status: 'INSUFFICIENT_EVIDENCE',
    predictedValue: null,
    confidence: 'INSUFFICIENT_EVIDENCE',
    confidenceScore: null,
    evidenceCount,
    dataWindow: null,
    modelVersion: MODEL_VERSION,
    trajectory: 'INSUFFICIENT_EVIDENCE',
    momentum: 'INSUFFICIENT_EVIDENCE',
    volatility: 'INSUFFICIENT_EVIDENCE',
    targetStatus: 'INSUFFICIENT_EVIDENCE',
    estimatedWeeksToTarget: null,
    bottlenecks: { primary: null, secondary: null, ranked: [], chain: [] },
    risks: [],
    falseMasterySignals: [],
    evidence: [],
    explanation: null,
    createdAt: now.toISOString(),
  };
}

function buildEvidenceItems(
  evidence: EvidenceBundle,
  trajectory: ReturnType<typeof classifyTrajectory>,
  bottlenecks: ReturnType<typeof detectBottlenecks>,
  risks: ReturnType<typeof detectRisks>
): ForecastEvidenceItem[] {
  const items: ForecastEvidenceItem[] = [];
  if (trajectory.state === 'UPWARD' || trajectory.state === 'SLOWING') {
    items.push({ metric: 'readiness_trajectory', value: trajectory.state, contribution: 'POSITIVE', source: 'FEATURE_6' });
  } else if (trajectory.state === 'REGRESSING' || trajectory.state === 'UNSTABLE') {
    items.push({ metric: 'readiness_trajectory', value: trajectory.state, contribution: 'LIMITING', source: 'FEATURE_6' });
  }
  for (const r of risks) {
    items.push({ metric: r.type, value: r.severity, contribution: 'LIMITING', source: 'FEATURE_9' });
  }
  if (bottlenecks.primary) {
    items.push({ metric: 'primary_bottleneck', value: bottlenecks.primary.skill, contribution: 'LIMITING', source: 'FEATURE_9' });
  }
  Object.entries(evidence.simulationScores).forEach(([skill, score]) => {
    if (score >= 80) items.push({ metric: `simulation:${skill}`, value: score, contribution: 'POSITIVE', source: 'FEATURE_9' });
  });
  return items;
}

function estimateDownstreamEffect(timeRatio: number | undefined): number {
  if (!timeRatio) return 0;
  return Math.min(1, Math.max(0, (timeRatio - 1) * 1.5));
}

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
