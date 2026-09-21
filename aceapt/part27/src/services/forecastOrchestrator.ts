/**
 * This is the closed loop from spec section 34:
 *   EVIDENCE -> CAPABILITY -> TRAJECTORY -> FORECAST -> RISK -> ADAPT ->
 *   INTERVENTION -> NEW EVIDENCE -> CAPABILITY UPDATE -> NEW FORECAST -> ...
 *
 * `runForecastPipeline` is steps 1 through "publish". `fixMyReadiness` is the
 * hand-off to Feature 26. Closing the loop (new evidence arriving, then
 * calling runForecastPipeline again) is driven by whatever emits
 * ASSESSMENT_COMPLETED in the real system — see src/api/server.ts for the
 * example listener, and scripts/demo.ts for a simulated end-to-end run.
 */
import type {
  CapabilityDimensionKey,
  CapabilitySnapshot,
  ForecastResult,
  ForecastSnapshotRecord,
  GapItem,
  MomentumState,
  ReadinessState,
  ReadinessTarget,
  RiskSignal,
  TransitionResult,
  TrendResult,
  WhyPanelContent,
} from "../domain/types.js";
import { CAPABILITY_DIMENSIONS } from "../domain/constants.js";
import { buildCapabilitySnapshot, computeOverallReadiness } from "../engines/capabilityModel.js";
import { computeGaps, identifyPrimaryGaps } from "../engines/targetGapEngine.js";
import { detectTrend } from "../engines/trajectoryEngine.js";
import { computeConfidence } from "../engines/evidenceConfidenceEngine.js";
import { generateForecast } from "../engines/forecastEngine.js";
import { determineMainFactor, identifyRisks } from "../engines/riskEngine.js";
import {
  detectFailureBoundary,
  detectFamiliarityGap,
  detectPracticeAssessmentGap,
} from "../engines/practiceAssessmentGapEngine.js";
import type { FailureBoundaryResult, PracticeAssessmentGapResult } from "../engines/practiceAssessmentGapEngine.js";
import { detectTransition } from "../engines/readinessStateMachine.js";
import { buildReadinessRoadmap, buildWhyPanel, narrateWhyPanel } from "../engines/explanationEngine.js";
import { estimateObservationsPerWeek } from "../utils/dates.js";
import { round } from "../utils/format.js";
import type { PlatformEvidenceGateway } from "../integration/platformEvidenceGateway.js";
import type { Feature26AdaptAdapter, InterventionPlan } from "../integration/feature26AdaptAdapter.js";
import type { AIExplanationProvider } from "../integration/aiExplanationProvider.js";
import type { ForecastRepository } from "../repository/forecastRepository.js";
import { FORECAST_EVENTS, type TypedEventBus } from "../events/eventBus.js";

export interface ForecastPipelineDeps {
  gateway: PlatformEvidenceGateway;
  repository: ForecastRepository;
  adaptAdapter: Feature26AdaptAdapter;
  eventBus: TypedEventBus;
  aiProvider?: AIExplanationProvider;
  now?: () => Date;
  defaultHorizonWeeks?: number;
}

export interface ForecastPipelineResult {
  studentId: string;
  generatedAt: string;
  capability: CapabilitySnapshot;
  currentOverall: number;
  target: ReadinessTarget | null;
  gaps: GapItem[];
  primaryGaps: GapItem[];
  overallTrend: TrendResult;
  dimensionTrends: TrendResult[];
  momentum: MomentumState;
  forecast: ForecastResult | null;
  risks: RiskSignal[];
  mainFactor: CapabilityDimensionKey | null;
  whyPanel: WhyPanelContent | null;
  whyNarrative: string | null;
  roadmap: string[];
  status: ReadinessState;
  transition: TransitionResult;
  practiceAssessmentGap: PracticeAssessmentGapResult | null;
  familiarityGap: ReturnType<typeof detectFamiliarityGap> | null;
  failureBoundary: FailureBoundaryResult | null;
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function runForecastPipeline(studentId: string, deps: ForecastPipelineDeps): Promise<ForecastPipelineResult> {
  const now = deps.now?.() ?? new Date();

  const [dimensionInputs, target, evidenceQuality, practiceVsAssessment, familiarityVsNovel, failureBoundaryStages] =
    await Promise.all([
      deps.gateway.getCapabilityEvidence(studentId),
      deps.gateway.getTarget(studentId),
      deps.gateway.getEvidenceQualitySummary(studentId),
      deps.gateway.getPracticeVsAssessment(studentId),
      deps.gateway.getFamiliarityVsNovel(studentId),
      deps.gateway.getFailureBoundary(studentId),
    ]);

  const capability = buildCapabilitySnapshot(studentId, dimensionInputs, now.toISOString());
  deps.eventBus.emit(FORECAST_EVENTS.CAPABILITY_UPDATED, { studentId, capability });

  const { value: currentOverall } = computeOverallReadiness(capability);

  const gaps = target ? computeGaps(capability, target) : [];
  const primaryGaps = identifyPrimaryGaps(gaps);

  const dimensionTrends: TrendResult[] = [];
  for (const dim of CAPABILITY_DIMENSIONS) {
    if (!capability.dimensions[dim]) continue;
    const history = await deps.gateway.getTrajectoryHistory(studentId, dim);
    const gapForDim = gaps.find((g) => g.dimension === dim)?.gap;
    dimensionTrends.push(detectTrend(dim, history, gapForDim));
  }

  const overallHistory = await deps.gateway.getTrajectoryHistory(studentId, "overall");
  const overallGap = target ? Math.max(0, target.overallTarget - currentOverall) : undefined;
  const overallTrend = detectTrend("overall", overallHistory, overallGap);
  deps.eventBus.emit(FORECAST_EVENTS.TRAJECTORY_UPDATED, { studentId, overallTrend, dimensionTrends });

  const confidence = computeConfidence(evidenceQuality);

  const daysRemaining = target?.assessmentDate
    ? (new Date(target.assessmentDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  const practiceAssessmentGap = practiceVsAssessment
    ? detectPracticeAssessmentGap(practiceVsAssessment.practiceScore, practiceVsAssessment.assessmentScore)
    : null;
  const familiarityGap = familiarityVsNovel
    ? detectFamiliarityGap(familiarityVsNovel.familiarScore, familiarityVsNovel.novelScore)
    : null;
  const failureBoundary = failureBoundaryStages ? detectFailureBoundary(failureBoundaryStages) : null;

  let forecast: ForecastResult | null = null;
  let risks: RiskSignal[] = [];
  let mainFactor: CapabilityDimensionKey | null = null;
  let whyPanel: WhyPanelContent | null = null;
  let roadmap: string[] = [];
  let status: ReadinessState = confidence.level === "INSUFFICIENT" ? "NOT_ENOUGH_EVIDENCE" : "DEVELOPING";

  if (target) {
    const avgSessionsPerWeek = estimateObservationsPerWeek(overallHistory) ?? undefined;
    forecast = generateForecast({
      studentId,
      current: currentOverall,
      target: target.overallTarget,
      trend: overallTrend,
      confidence,
      daysRemaining,
      avgSessionsPerWeek,
      defaultHorizonWeeks: deps.defaultHorizonWeeks,
      now,
    });
    deps.eventBus.emit(FORECAST_EVENTS.FORECAST_TRIGGERED, { studentId, forecast });

    risks = identifyRisks({
      gaps,
      overallTrend,
      dimensionTrends,
      confidence,
      practiceAssessmentGap,
      failureBoundary,
      currentOverall,
      targetOverall: target.overallTarget,
      forecastRange: forecast.projectedRange,
    });
    deps.eventBus.emit(FORECAST_EVENTS.RISK_RECALCULATED, { studentId, risks });

    mainFactor = determineMainFactor(risks, gaps);
    forecast = { ...forecast, mainFactor };

    whyPanel = buildWhyPanel({ gaps, risks, overallTrend, confidence });
    roadmap = buildReadinessRoadmap(primaryGaps, risks, target);
    status = forecast.status;
  }

  const previousSnapshot = await deps.repository.getLatestForecastSnapshot(studentId);
  const transition = detectTransition(previousSnapshot?.status ?? null, status);

  const whyNarrative = whyPanel ? await narrateWhyPanel(whyPanel, deps.aiProvider) : null;

  if (target) {
    const record: ForecastSnapshotRecord = {
      id: generateId("fcs"),
      studentId,
      generatedAt: now.toISOString(),
      forecast,
      gaps,
      risks,
      whyPanel,
      status,
    };
    await deps.repository.saveForecastSnapshot(record);
    deps.eventBus.emit(FORECAST_EVENTS.FORECAST_PUBLISHED, { studentId, record });
  }

  return {
    studentId,
    generatedAt: now.toISOString(),
    capability,
    currentOverall: round(currentOverall),
    target,
    gaps,
    primaryGaps,
    overallTrend,
    dimensionTrends,
    momentum: overallTrend.momentum,
    forecast,
    risks,
    mainFactor,
    whyPanel,
    whyNarrative,
    roadmap,
    status,
    transition,
    practiceAssessmentGap,
    familiarityGap,
    failureBoundary,
  };
}

/** Section 39/50: "FIX MY READINESS" — hands the current top gap to Feature 26
 * and returns both the fresh pipeline result and the generated plan. */
export async function fixMyReadiness(
  studentId: string,
  deps: ForecastPipelineDeps,
): Promise<{ pipeline: ForecastPipelineResult; plan: InterventionPlan }> {
  const pipeline = await runForecastPipeline(studentId, deps);
  const topRisk = pipeline.risks[0];
  const plan = await deps.adaptAdapter.requestIntervention({
    studentId,
    focusDimension: pipeline.mainFactor,
    riskExplanation: topRisk?.explanation ?? "No dominant risk identified from current evidence; general practice recommended.",
  });
  deps.eventBus.emit(FORECAST_EVENTS.FEATURE26_UPDATED, { studentId, plan });
  return { pipeline, plan };
}
