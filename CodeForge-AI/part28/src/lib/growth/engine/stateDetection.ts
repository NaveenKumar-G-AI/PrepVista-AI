import type { GrowthEvidence, GrowthState, TrendDirection } from "../types.ts";
import { GrowthConfig } from "../config.ts";
import {
  daysAgo,
  distinctChallengeFamilies,
  sortByOccurredAt,
  successRate,
  splitBaselineVsRecent,
} from "../utils.ts";

export interface DimensionStateResult {
  state: GrowthState;
  trend: TrendDirection;
  velocity: "SLOW" | "MODERATE" | "FAST" | null;
  baselineState: GrowthState | null;
  baselineRate: number | null;
  recentRate: number | null;
  delta: number | null;
}

/**
 * Classifies a chunk of evidence by ABSOLUTE performance level only (no
 * before/after comparison). Used both for the baseline window's own label
 * and for dimensions that don't yet have a comparable baseline at all.
 * Deliberately narrow: this function is never allowed to return a
 * "movement" state (IMPROVING/REGRESSING/STAGNATING/RECOVERING) because it
 * has no earlier point to move from.
 */
function classifyAbsoluteLevel(evidence: GrowthEvidence[]): GrowthState {
  const cfg = GrowthConfig.evidence;
  if (evidence.length === 0) return "NO_EVIDENCE";
  if (evidence.length < cfg.minCountForAnyConclusion) return "EMERGING";

  const rate = successRate(evidence);
  const families = distinctChallengeFamilies(evidence);
  const diverseEnough = families >= GrowthConfig.diversity.minFamiliesForDiverse;

  if (rate >= 0.75 && evidence.length >= GrowthConfig.mastery.minEvidenceForStrong && diverseEnough) {
    return "STRONG";
  }
  if (rate <= 0.35) return "AT_RISK";
  return "STABLE";
}

function bucketVelocity(absDelta: number, windowDays: number): "SLOW" | "MODERATE" | "FAST" {
  const perDay = absDelta / Math.max(windowDays, 1);
  if (perDay <= GrowthConfig.velocity.slowMax) return "SLOW";
  if (perDay <= GrowthConfig.velocity.moderateMax) return "MODERATE";
  return "FAST";
}

/**
 * Determines the growth state for ONE dimension from its full evidence
 * history. This function does its own baseline/recent split internally —
 * callers should pass in all available evidence for the dimension (already
 * filtered to the student and, if relevant, the requested outer time
 * window), not a pre-split slice.
 *
 * `previousState` is optional context from the immediately prior snapshot,
 * used only to (a) prefer RECOVERING over a bare IMPROVING label when a
 * dip preceded this evidence, and (b) add hysteresis so the state doesn't
 * flip on marginal noise — see README §GrowthStability.
 */
export function detectDimensionState(
  allEvidence: GrowthEvidence[],
  options: { now?: Date; previousState?: GrowthState | null } = {},
): DimensionStateResult {
  const now = options.now ?? new Date();
  const cfg = GrowthConfig.evidence;
  const evidence = sortByOccurredAt(allEvidence);

  if (evidence.length === 0) {
    return { state: "NO_EVIDENCE", trend: "UNKNOWN", velocity: null, baselineState: null, baselineRate: null, recentRate: null, delta: null };
  }

  if (evidence.length < cfg.minCountForAnyConclusion) {
    // Single (or zero-passing-the-floor) data point. A lone success may
    // establish EMERGING; a lone failure/partial establishes nothing yet —
    // "one isolated failure does not create regression".
    const onlySuccess = evidence.length >= 1 && evidence.every((e) => e.outcome === "SUCCESS");
    return {
      state: onlySuccess ? "EMERGING" : "INSUFFICIENT_EVIDENCE",
      trend: "UNKNOWN",
      velocity: null,
      baselineState: null,
      baselineRate: null,
      recentRate: null,
      delta: null,
    };
  }

  const { baseline, recent } = splitBaselineVsRecent(
    evidence,
    cfg.recentWindowDays,
    cfg.minBaselineSeparationDays,
    now,
  );

  // No comparable prior window yet: everything we have is "recent". We can
  // describe the current absolute level, but we cannot claim a trend,
  // because there is nothing earlier to be trending away from.
  if (baseline.length === 0) {
    const state = classifyAbsoluteLevel(recent.length > 0 ? recent : evidence);
    return {
      state,
      trend: "UNKNOWN",
      velocity: null,
      baselineState: null,
      baselineRate: null,
      recentRate: recent.length > 0 ? Number(successRate(recent).toFixed(3)) : null,
      delta: null,
    };
  }

  const baselineRate = successRate(baseline);
  const baselineState = classifyAbsoluteLevel(baseline);

  if (recent.length === 0) {
    // Had a baseline once, nothing recent — describe by the baseline level,
    // flagged as stale via trend UNKNOWN rather than silently reusing an
    // old "recent" number.
    return { state: baselineState, trend: "UNKNOWN", velocity: null, baselineState, baselineRate: Number(baselineRate.toFixed(3)), recentRate: null, delta: null };
  }

  const recentRate = successRate(recent);
  const delta = recentRate - baselineRate;
  const absDelta = Math.abs(delta);
  const sig = GrowthConfig.significance;
  const stg = GrowthConfig.stagnation;

  const trend: TrendDirection = absDelta <= sig.noiseFloor ? "FLAT" : delta > 0 ? "POSITIVE" : "NEGATIVE";

  // Stagnation: plenty of recent activity, but it isn't moving the needle,
  // and there was room to move (baseline wasn't already at the floor).
  if (recent.length >= stg.minRecentActivityForStagnation && absDelta <= stg.maxDeltaConsideredFlat && baselineState !== "AT_RISK") {
    return {
      state: "STAGNATING",
      trend: "FLAT",
      velocity: null,
      baselineState,
      baselineRate: Number(baselineRate.toFixed(3)),
      recentRate: Number(recentRate.toFixed(3)),
      delta: Number(delta.toFixed(3)),
    };
  }

  const meetsImprovingEvidenceBar = recent.length >= cfg.minCountForImprovingClaim;
  const meetsRegressingEvidenceBar = recent.length >= cfg.minCountForRegressingClaim;

  if (delta >= sig.minSuccessRateDelta && meetsImprovingEvidenceBar) {
    const wasDipping = options.previousState === "REGRESSING" || options.previousState === "AT_RISK";
    const diverseEnough = distinctChallengeFamilies(recent) >= GrowthConfig.diversity.minFamiliesForDiverse;
    const strongNow = recentRate >= 0.75 && recent.length >= GrowthConfig.mastery.minEvidenceForStrong && diverseEnough;

    const hasTransfer = recent.some((e) => e.isTransfer && e.outcome === "SUCCESS");
    const hasRetention = recent.some((e) => e.isRetentionCheck && e.outcome === "SUCCESS");
    const spanDays = daysAgo(evidence[0]!.occurredAt, now);
    const masteredNow = strongNow && hasTransfer && hasRetention && spanDays >= GrowthConfig.mastery.minSpanDaysForMastered;

    const state: GrowthState = wasDipping ? "RECOVERING" : masteredNow ? "MASTERED" : strongNow ? "STRONG" : "IMPROVING";

    return {
      state,
      trend: "POSITIVE",
      velocity: bucketVelocity(absDelta, cfg.recentWindowDays),
      baselineState,
      baselineRate: Number(baselineRate.toFixed(3)),
      recentRate: Number(recentRate.toFixed(3)),
      delta: Number(delta.toFixed(3)),
    };
  }

  if (delta <= -sig.minSuccessRateDelta) {
    const state: GrowthState = meetsRegressingEvidenceBar ? "REGRESSING" : "AT_RISK";
    return {
      state,
      trend: "NEGATIVE",
      velocity: meetsRegressingEvidenceBar ? bucketVelocity(absDelta, cfg.recentWindowDays) : null,
      baselineState,
      baselineRate: Number(baselineRate.toFixed(3)),
      recentRate: Number(recentRate.toFixed(3)),
      delta: Number(delta.toFixed(3)),
    };
  }

  // Neither a significant rise nor fall: describe current absolute level.
  const state = classifyAbsoluteLevel(recent);
  return {
    state: state === "EMERGING" ? "STABLE" : state, // enough total evidence exists to at least call it STABLE, not EMERGING
    trend,
    velocity: null,
    baselineState,
    baselineRate: Number(baselineRate.toFixed(3)),
    recentRate: Number(recentRate.toFixed(3)),
    delta: Number(delta.toFixed(3)),
  };
}
