/**
 * PrepVista AI — Part 15
 *
 * ForecastService
 * ────────────────
 * Two independent, real methods are computed and blended:
 *
 *  1. BASELINE — "historical season trajectory" (Section 16). For each
 *     completed season, look at placement% at the same fractional point in
 *     the season as today, and how much it grew by season end. Average that
 *     uplift across seasons and apply it to today's %.
 *
 *  2. PRIMARY — "pipeline-weighted projection" (Section 11, opportunity
 *     pipeline forecast; Section 8 research area "funnel forecasting").
 *     Every currently-unplaced student sits in exactly one engagement-status
 *     bucket (offer accepted & awaiting join / in interview / applied /
 *     not yet engaged). Each bucket has a historical "eventual verified
 *     placement by season end" rate. Multiply and sum.
 *
 * The two methods rarely agree exactly — that disagreement, plus the
 * backtested historical error of the baseline method, is what drives the
 * width of the confidence interval (Section 22 — uncertainty must be real,
 * not decorative).
 */

import type {
  ConfidenceLevel,
  CurrentSeasonSnapshot,
  DepartmentForecast,
  ForecastEnvelope,
  SeasonSummary,
} from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import type { ForecastPerformanceService } from "./ForecastPerformanceService.js";
import { MIN_DEPARTMENT_SAMPLE_SIZE } from "./thresholds.js";
import { clamp, mean, meanAbsoluteError, round1, shrinkTowardPrior, stdev } from "./stats.js";

export const FORECAST_MODEL_VERSION = "forecast-v1.0.0";

export interface ForecastComponents {
  baselineEstimate: number;
  pipelineEstimate: number;
  blendedEstimate: number;
  spread: number;
  backtestMAE: number;
  historicalSeasonCount: number;
}

export class ForecastService {
  constructor(private readonly repo: PlacementDataRepository, private readonly performance?: ForecastPerformanceService) {}

  // ── Baseline: historical uplift at a comparable checkpoint ──────────────
  private baselineFromHistory(historical: SeasonSummary[], currentPct: number, currentFraction: number): { estimate: number; comparableSeasons: SeasonSummary[] } {
    const comparable = historical.filter((s) => Math.abs(s.fractionElapsedAtSnapshot - currentFraction) < 0.05 && s.finalPlacementPct !== null);
    if (comparable.length === 0) {
      return { estimate: currentPct, comparableSeasons: [] };
    }
    const uplifts = comparable.map((s) => (s.finalPlacementPct as number) - s.placementPctAtComparableCheckpoint);
    return { estimate: currentPct + mean(uplifts), comparableSeasons: comparable };
  }

  /** Leave-one-out backtest of the baseline method across historical seasons — Section 17/56. */
  private backtestBaseline(historical: SeasonSummary[]): number {
    const comparable = historical.filter((s) => s.finalPlacementPct !== null);
    if (comparable.length < 2) return NaN; // not enough seasons to backtest at all
    const errors: number[] = [];
    for (let i = 0; i < comparable.length; i++) {
      const heldOut = comparable[i]!;
      const rest = comparable.filter((_, idx) => idx !== i);
      const uplift = mean(rest.map((s) => (s.finalPlacementPct as number) - s.placementPctAtComparableCheckpoint));
      const predicted = heldOut.placementPctAtComparableCheckpoint + uplift;
      errors.push(predicted - (heldOut.finalPlacementPct as number));
    }
    return meanAbsoluteError(errors);
  }

  // ── Primary: pipeline-weighted projection over remaining-pool buckets ───
  private pipelineEstimateFromSnapshot(snapshot: CurrentSeasonSnapshot): number {
    const additional = snapshot.remainingPool.reduce((sum, b) => sum + b.count * b.historicalEventualJoinRate, 0);
    const projectedJoined = snapshot.verifiedPlacements + additional;
    return (projectedJoined / snapshot.totalEligibleStudents) * 100;
  }

  private confidenceFor(components: ForecastComponents, freshness: CurrentSeasonSnapshot["freshnessStatus"], sampleSize: number): { tier: ConfidenceLevel; liveDowngrade: string | null } {
    if (freshness === "DELAYED") return { tier: "LOW", liveDowngrade: null };
    if (sampleSize < MIN_DEPARTMENT_SAMPLE_SIZE) return { tier: "LOW", liveDowngrade: null };
    const { spread, backtestMAE, historicalSeasonCount } = components;
    let tier: ConfidenceLevel;
    if (historicalSeasonCount >= 4 && !Number.isNaN(backtestMAE) && backtestMAE < 1.0 && spread < 1.5) tier = "HIGH";
    else if (historicalSeasonCount >= 2 && (Number.isNaN(backtestMAE) || backtestMAE < 2.5)) tier = "MEDIUM";
    else tier = "LOW";

    // PART15_HOSTILE_REVIEW.md finding F2: a 4-season backtest can support HIGH
    // confidence forever even if the model is visibly drifting in production.
    // Live tracked accuracy (Section 23/24/56) can only ever DOWNGRADE the tier
    // below — it never upgrades beyond what the backtest itself supports.
    const live = this.performance?.getAccuracySummary();
    if (live && live.count >= 3 && !Number.isNaN(live.mae)) {
      if (live.mae > 6 && tier !== "LOW") return { tier: "LOW", liveDowngrade: `Live tracked MAE ${live.mae} over ${live.count} resolved forecast(s) exceeds 6 points — confidence capped at LOW regardless of backtest.` };
      if (live.mae > 3 && tier === "HIGH") return { tier: "MEDIUM", liveDowngrade: `Live tracked MAE ${live.mae} over ${live.count} resolved forecast(s) exceeds 3 points — confidence capped at MEDIUM regardless of backtest.` };
    }
    return { tier, liveDowngrade: null };
  }

  async computeInstitutionForecastComponents(asOf: string): Promise<{ snapshot: CurrentSeasonSnapshot; historical: SeasonSummary[]; components: ForecastComponents }> {
    const [snapshot, historical] = await Promise.all([this.repo.getCurrentSeasonSnapshot(asOf), this.repo.getHistoricalSeasonSummaries()]);
    const currentPct = (snapshot.verifiedPlacements / snapshot.totalEligibleStudents) * 100;
    const baseline = this.baselineFromHistory(historical, currentPct, snapshot.fractionElapsed);
    const pipeline = this.pipelineEstimateFromSnapshot(snapshot);
    const backtestMAE = this.backtestBaseline(historical);
    const blended = (baseline.estimate + pipeline) / 2;
    const spread = Math.abs(baseline.estimate - pipeline) / 2;
    return {
      snapshot,
      historical,
      components: {
        baselineEstimate: round1(baseline.estimate),
        pipelineEstimate: round1(pipeline),
        blendedEstimate: round1(blended),
        spread: round1(spread),
        backtestMAE: Number.isNaN(backtestMAE) ? NaN : round1(backtestMAE),
        historicalSeasonCount: historical.filter((s) => s.finalPlacementPct !== null).length,
      },
    };
  }

  async getPlacementForecast(asOf: string, now: Date = new Date()): Promise<ForecastEnvelope> {
    const { snapshot, components } = await this.computeInstitutionForecastComponents(asOf);
    const margin = Math.max(components.spread, Number.isNaN(components.backtestMAE) ? 2.0 : components.backtestMAE, 0.5);
    const { tier: confidence, liveDowngrade } = this.confidenceFor(components, snapshot.freshnessStatus, snapshot.totalEligibleStudents);
    const limitations = [
      "Remaining-pool eventual-join rates are institutional historical constants in this build; production should derive them from tracked cohort outcomes, refreshed periodically.",
      "Baseline method assumes historical seasons are comparable to the current season at the same fractional point — see Section 57 comparability checks.",
    ];
    if (Number.isNaN(components.backtestMAE)) limitations.push("Fewer than 2 historical seasons available — backtested error could not be computed; confidence is capped accordingly.");
    if (components.historicalSeasonCount > 0 && components.historicalSeasonCount < 6) limitations.push(`Backtest uses only ${components.historicalSeasonCount} historical season(s) — the MAE estimate above is itself imprecise with this few folds.`);
    if (liveDowngrade) limitations.push(liveDowngrade);
    return {
      dataAvailable: true,
      pointEstimate: components.blendedEstimate,
      range: { low: round1(components.blendedEstimate - margin), high: round1(components.blendedEstimate + margin) },
      confidence,
      forecastHorizon: `season end (${snapshot.seasonId} season)`,
      generatedAt: now.toISOString(),
      modelVersion: FORECAST_MODEL_VERSION,
      inputWindow: `${components.historicalSeasonCount} historical season(s) + current season through ${asOf}`,
      dataThrough: asOf,
      freshness: snapshot.freshnessStatus,
      sampleSize: snapshot.totalEligibleStudents,
      limitations,
      method: "BLENDED",
    };
  }

  /** In this domain model "joining" and "verified placement" are the same event — see repository/demo/seed.ts. Exposed separately because Part 12's AI tool surface calls it by this name (Section 48). */
  async getJoiningForecast(asOf: string, now: Date = new Date()): Promise<ForecastEnvelope> {
    return this.getPlacementForecast(asOf, now);
  }

  async getOfferForecast(asOf: string, now: Date = new Date()): Promise<ForecastEnvelope> {
    const snapshot = await this.repo.getCurrentSeasonSnapshot(asOf);
    const offerHolders = snapshot.remainingPool.find((b) => b.status === "OFFER_ACCEPTED_AWAITING_JOIN")?.count ?? 0;
    const currentlyOffered = snapshot.verifiedPlacements + offerHolders;
    // Eventual "will receive at least one offer by season end" rates — necessarily
    // higher than the eventual-JOIN rates used for the placement forecast.
    const eventualOfferRate: Record<string, number> = {
      OFFER_ACCEPTED_AWAITING_JOIN: 1,
      IN_INTERVIEW_STAGE: 0.55,
      APPLIED_AWAITING_INTERVIEW: 0.25,
      NO_ACTIVE_APPLICATION: 0.06,
    };
    const additional = snapshot.remainingPool
      .filter((b) => b.status !== "OFFER_ACCEPTED_AWAITING_JOIN")
      .reduce((sum, b) => sum + b.count * (eventualOfferRate[b.status] ?? 0), 0);
    const projected = currentlyOffered + additional;
    const pct = (projected / snapshot.totalEligibleStudents) * 100;
    const margin = 2.0; // wider default margin — this metric isn't backtested against history in this build
    return {
      dataAvailable: true,
      pointEstimate: round1(pct),
      range: { low: round1(pct - margin), high: round1(pct + margin) },
      confidence: "MEDIUM",
      forecastHorizon: `season end (${snapshot.seasonId} season)`,
      generatedAt: now.toISOString(),
      modelVersion: FORECAST_MODEL_VERSION,
      inputWindow: `current season through ${asOf}`,
      dataThrough: asOf,
      freshness: snapshot.freshnessStatus,
      sampleSize: snapshot.totalEligibleStudents,
      limitations: ["Eventual-offer rates are demo constants, not backtested against historical seasons — treat this forecast as lower-confidence than the placement forecast."],
      method: "PIPELINE_WEIGHTED_PROJECTION",
    };
  }

  async getDepartmentForecast(departmentId: string, asOf: string, now: Date = new Date()): Promise<DepartmentForecast> {
    const [state, snapshot] = await Promise.all([
      this.repo.getDepartmentSeasonState(departmentId, await this.repo.getCurrentSeasonId(), asOf),
      this.repo.getCurrentSeasonSnapshot(asOf),
    ]);

    if (state.totalStudents < MIN_DEPARTMENT_SAMPLE_SIZE) {
      return {
        departmentId,
        dataAvailable: false,
        reason: `insufficient_sample (n=${state.totalStudents}, minimum ${MIN_DEPARTMENT_SAMPLE_SIZE}). Institution-level forecast available instead.`,
        generatedAt: now.toISOString(),
        modelVersion: FORECAST_MODEL_VERSION,
        inputWindow: `current season through ${asOf}`,
        dataThrough: asOf,
        freshness: snapshot.freshnessStatus,
        sampleSize: state.totalStudents,
        limitations: [`Department has only ${state.totalStudents} students — too few for a department-specific forecast to be reliable.`],
        method: "BASELINE_HISTORICAL_UPLIFT",
      };
    }

    // ── Method A: shrinkage estimate — Section 21/61 ──
    // Department's own observed % pulled toward the institution % in
    // proportion to how little data backs it (small depts shrink hard).
    const instPct = (snapshot.verifiedPlacements / snapshot.totalEligibleStudents) * 100;
    const deptPct = (state.verifiedPlacements / state.totalStudents) * 100;
    const priorWeight = 60;
    const shrinkageEstimate = shrinkTowardPrior(deptPct, state.totalStudents, instPct, priorWeight);

    // ── Method B: department pipeline projection ──
    // Uses this department's own remaining-pool STRUCTURE (how many of its
    // unplaced students are in each engagement-status bucket — a reliable,
    // department-specific count) combined with INSTITUTION-level historical
    // eventual-join RATES per bucket (borrowed rather than fit per-department,
    // since a department-specific rate would itself be a small-sample
    // estimate — see PART15_HOSTILE_REVIEW.md finding F1 / PART15_RESEARCH.md #2).
    const pipelineAdditional = state.remainingPool.reduce((sum, b) => sum + b.count * b.historicalEventualJoinRate, 0);
    const pipelineEstimate = ((state.verifiedPlacements + pipelineAdditional) / state.totalStudents) * 100;

    const blended = (shrinkageEstimate + pipelineEstimate) / 2;
    const methodSpread = Math.abs(shrinkageEstimate - pipelineEstimate);

    const confidence: ConfidenceLevel = state.totalStudents < 50 ? "LOW" : state.totalStudents < 150 ? "MEDIUM" : "HIGH";
    // Disagreement between the two methods widens the interval beyond the
    // confidence-tier default — the same "spread signals uncertainty"
    // principle used at the institution level.
    const baseMargin = confidence === "HIGH" ? 2.5 : confidence === "MEDIUM" ? 4 : 6;
    const margin = Math.max(baseMargin, methodSpread / 2 + 1);

    return {
      departmentId,
      dataAvailable: true,
      pointEstimate: round1(clamp(blended, 0, 100)),
      range: { low: round1(clamp(blended - margin, 0, 100)), high: round1(clamp(blended + margin, 0, 100)) },
      confidence,
      forecastHorizon: `season end (${snapshot.seasonId} season)`,
      generatedAt: now.toISOString(),
      modelVersion: FORECAST_MODEL_VERSION,
      inputWindow: `current season through ${asOf}: shrinkage estimate (prior weight ${priorWeight}) blended with department pipeline projection`,
      dataThrough: asOf,
      freshness: snapshot.freshnessStatus,
      sampleSize: state.totalStudents,
      limitations: [
        "Department pipeline projection borrows institution-level historical eventual-join rates applied to this department's own bucket counts — see PART15_RESEARCH.md #2 for why a department-specific rate isn't fit directly.",
        `Shrinkage estimate ${round1(shrinkageEstimate)}% vs pipeline estimate ${round1(pipelineEstimate)}% — the ${round1(methodSpread)}-point spread between methods contributes to the range width above.`,
      ],
      method: "BLENDED",
    };
  }
}
