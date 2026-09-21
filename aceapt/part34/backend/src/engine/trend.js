/*
 * ---------------------------------------------------------------------------
 * TREND ENGINE (deterministic - no I/O, no AI)
 * ---------------------------------------------------------------------------
 * Given a time-ordered list of evidence signals for one capability, classify
 * the trend and how much to trust that classification.
 *
 * The thresholds below are explicit, commented business rules, not a fitted
 * or learned model. That's intentional for an MVP: every classification can
 * be explained in a sentence by pointing at the slope and the data it came
 * from (brief section 11 - "evidence-first intelligence" - and section 44 -
 * "deterministic vs AI"). Replacing this with a statistical or learned model
 * later is an isolated swap; nothing outside this file needs to change.
 * ---------------------------------------------------------------------------
 */

export const TREND = {
  ACCELERATING: 'ACCELERATING',
  IMPROVING: 'IMPROVING',
  STABLE: 'STABLE',
  SLOWING: 'SLOWING',
  STALLED: 'STALLED',
  DECLINING: 'DECLINING',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
};

export const CONFIDENCE = {
  HIGH: 'HIGH',
  MODERATE: 'MODERATE',
  LOW: 'LOW',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
};

const MIN_POINTS_FOR_TREND = 3;
const MIN_SPAN_DAYS_FOR_TREND = 7;

const IMPROVE_THRESHOLD_PER_WEEK = 1.5; // score points/week to count as a real improvement
const STABLE_BAND_PER_WEEK = 0.5; // within +-0.5 pt/week counts as "flat"
const DECLINE_THRESHOLD_PER_WEEK = -1.5;
const ACCELERATE_RATIO = 1.4; // second-half slope must exceed first-half by this much

function toDayIndex(signalsAsc) {
  const first = new Date(signalsAsc[0].occurredAt).getTime();
  return signalsAsc.map((s) => ({
    x: (new Date(s.occurredAt).getTime() - first) / 86400000,
    y: s.score,
  }));
}

function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom; // score points per day
}

function directionConsistency(points, overallSlope) {
  if (points.length < 3) return 0.5;
  let agree = 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].y - points[i - 1].y;
    if (delta === 0) continue;
    total++;
    if (Math.sign(delta) === Math.sign(overallSlope) || Math.abs(overallSlope) < 0.05) agree++;
  }
  return total === 0 ? 0.5 : agree / total;
}

export function classifyConfidence({ n, spanDays, consistency }) {
  if (n < MIN_POINTS_FOR_TREND) return CONFIDENCE.INSUFFICIENT_DATA;
  if (n >= 6 && spanDays >= 21 && consistency >= 0.7) return CONFIDENCE.HIGH;
  if (n >= 4 && spanDays >= 10) return CONFIDENCE.MODERATE;
  return CONFIDENCE.LOW;
}

/**
 * @param {Array<{score:number, occurredAt:string}>} signalsAsc ascending by date
 * @param {number} requiredLevel the target's required level for this capability -
 *   used only to tell STABLE (holding at/above target) apart from STALLED
 *   (flat, below target - the "activity without progress" case).
 */
export function computeCapabilityTrend(signalsAsc, requiredLevel = 100) {
  const n = signalsAsc.length;
  if (n === 0) {
    return { trend: TREND.INSUFFICIENT_DATA, confidence: CONFIDENCE.INSUFFICIENT_DATA, weeklySlope: null, spanDays: 0, n: 0, latestLevel: null };
  }

  const spanDays = (new Date(signalsAsc[n - 1].occurredAt) - new Date(signalsAsc[0].occurredAt)) / 86400000;
  const latestLevel = signalsAsc[n - 1].score;

  if (n < MIN_POINTS_FOR_TREND || spanDays < MIN_SPAN_DAYS_FOR_TREND) {
    return { trend: TREND.INSUFFICIENT_DATA, confidence: CONFIDENCE.INSUFFICIENT_DATA, weeklySlope: null, spanDays: Math.round(spanDays), n, latestLevel };
  }

  const points = toDayIndex(signalsAsc);
  const weeklySlope = slope(points) * 7;

  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, Math.max(2, mid));
  const secondHalf = points.slice(mid);
  const firstSlope = slope(firstHalf);
  const secondSlope = slope(secondHalf);

  const consistency = directionConsistency(points, weeklySlope);
  const confidence = classifyConfidence({ n, spanDays, consistency });
  const atOrAboveTarget = latestLevel >= requiredLevel;

  let trend;
  if (weeklySlope > IMPROVE_THRESHOLD_PER_WEEK) {
    trend = secondSlope > firstSlope * ACCELERATE_RATIO && firstSlope > 0 ? TREND.ACCELERATING : TREND.IMPROVING;
  } else if (weeklySlope < DECLINE_THRESHOLD_PER_WEEK) {
    trend = TREND.DECLINING;
  } else if (weeklySlope > STABLE_BAND_PER_WEEK) {
    trend = secondSlope < firstSlope ? TREND.SLOWING : TREND.IMPROVING;
  } else if (weeklySlope < -STABLE_BAND_PER_WEEK) {
    trend = TREND.SLOWING;
  } else {
    trend = atOrAboveTarget ? TREND.STABLE : TREND.STALLED;
  }

  return { trend, confidence, weeklySlope: Number(weeklySlope.toFixed(2)), spanDays: Math.round(spanDays), n, latestLevel };
}

/**
 * Rolls per-capability trends up into one overall trajectory label, weighted
 * by how much each capability matters for the target (brief section 6 -
 * "don't confuse state with trajectory", and the worked example in section
 * 68: overall trajectory can read "Improving" while one specific capability
 * is called out as stalled - both things are true and both are shown).
 *
 * Capabilities with insufficient data are excluded from this comparison
 * (not treated as zero or as negative) so one unmeasured capability can't
 * silently drag the whole trajectory down - it's surfaced separately as an
 * evidence gap instead (see engine/recommend.js).
 */
export function computeOverallTrajectory(capabilityTrends) {
  const usable = capabilityTrends.filter((c) => c.trend.trend !== TREND.INSUFFICIENT_DATA);
  const excludedForInsufficientData = capabilityTrends
    .filter((c) => c.trend.trend === TREND.INSUFFICIENT_DATA)
    .map((c) => c.label);

  if (usable.length === 0) {
    return { trajectory: TREND.INSUFFICIENT_DATA, confidence: CONFIDENCE.INSUFFICIENT_DATA, basis: [], excludedForInsufficientData };
  }

  const totalWeight = usable.reduce((a, c) => a + c.weight, 0);
  const positiveWeight = usable
    .filter((c) => [TREND.IMPROVING, TREND.ACCELERATING].includes(c.trend.trend))
    .reduce((a, c) => a + c.weight, 0);
  const negativeWeight = usable
    .filter((c) => [TREND.STALLED, TREND.DECLINING].includes(c.trend.trend))
    .reduce((a, c) => a + c.weight, 0);
  const hasAccelerating = usable.some((c) => c.trend.trend === TREND.ACCELERATING);
  const hasDeclining = usable.some((c) => c.trend.trend === TREND.DECLINING);

  let trajectory;
  if (positiveWeight >= negativeWeight * 1.3 && positiveWeight / totalWeight >= 0.4) {
    trajectory = hasAccelerating ? TREND.ACCELERATING : TREND.IMPROVING;
  } else if (negativeWeight >= positiveWeight * 1.3 && negativeWeight / totalWeight >= 0.4) {
    trajectory = hasDeclining ? TREND.DECLINING : TREND.STALLED;
  } else if (positiveWeight !== negativeWeight) {
    trajectory = TREND.SLOWING; // net movement either way, but not decisive enough to call outright
  } else {
    trajectory = TREND.STABLE;
  }

  const confidenceRank = { INSUFFICIENT_DATA: 0, LOW: 1, MODERATE: 2, HIGH: 3 };
  const worst = usable.reduce(
    (min, c) => (confidenceRank[c.trend.confidence] < confidenceRank[min] ? c.trend.confidence : min),
    CONFIDENCE.HIGH
  );
  const anyExcluded = usable.length < capabilityTrends.length;

  return {
    trajectory,
    confidence: anyExcluded && worst === CONFIDENCE.HIGH ? CONFIDENCE.MODERATE : worst,
    basis: usable.map((c) => ({ capability: c.capability, label: c.label, trend: c.trend.trend, weeklySlope: c.trend.weeklySlope })),
    excludedForInsufficientData,
  };
}
