import type { TimePoint } from "./trends";

export type RegressionType =
  | "PERFORMANCE_DROP"
  | "RETENTION_DROP"
  | "TRANSFER_DROP"
  | "UNDERSTANDING_DROP"
  | "ROLE_SKILL_DROP";

export interface RegressionEvent {
  type: RegressionType;
  peakValue: number;
  troughValue: number;
  magnitude: number;
  peakObservedAt: string;
  troughObservedAt: string;
  confirmedByConsecutiveDeclines: number;
}

export interface RegressionResult {
  status: "REGRESSION_DETECTED" | "NO_REGRESSION" | "INSUFFICIENT_EVIDENCE";
  event?: RegressionEvent;
}

/** A single bad submission must never trigger a regression on its own. */
const MIN_CONSECUTIVE_DECLINES = 3;
/** Below this many points of decline, treat it as normal variance, not a regression. */
const MIN_REGRESSION_MAGNITUDE = 8;

function byTime(a: TimePoint, b: TimePoint): number {
  return new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime();
}

/**
 * Looks for a sustained decline ending at the most recent observation.
 * Requires several consecutive drops AND a minimum magnitude before it will
 * call it a regression — a single rough session is not a regression.
 */
export function detectRegression(
  points: TimePoint[],
  type: RegressionType = "PERFORMANCE_DROP"
): RegressionResult {
  const sorted = [...points].sort(byTime);
  if (sorted.length < MIN_CONSECUTIVE_DECLINES + 1) return { status: "INSUFFICIENT_EVIDENCE" };

  let declineCount = 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i]!.value < sorted[i - 1]!.value) declineCount++;
    else break;
  }

  if (declineCount < MIN_CONSECUTIVE_DECLINES) return { status: "NO_REGRESSION" };

  const peakIndex = sorted.length - 1 - declineCount;
  const peak = sorted[peakIndex]!;
  const trough = sorted[sorted.length - 1]!;
  const magnitude = Math.round((peak.value - trough.value) * 10) / 10;

  if (magnitude < MIN_REGRESSION_MAGNITUDE) return { status: "NO_REGRESSION" };

  return {
    status: "REGRESSION_DETECTED",
    event: {
      type,
      peakValue: peak.value,
      troughValue: trough.value,
      magnitude,
      peakObservedAt: peak.observedAt,
      troughObservedAt: trough.observedAt,
      confirmedByConsecutiveDeclines: declineCount,
    },
  };
}

export interface RecoveryResult {
  status: "RECOVERED" | "RECOVERING" | "NOT_RECOVERING";
  currentValue: number;
  recoveredFraction: number; // 0-1+, share of the lost ground regained
}

/** Within this many points of the pre-regression peak counts as fully recovered. */
const RECOVERY_TOLERANCE = 2;
const RECOVERING_FRACTION_THRESHOLD = 0.5;

/**
 * Given a confirmed regression and observations that came after its trough,
 * determines whether the student has climbed back out of it. This is what
 * lets the system say "regression, then recovery" instead of permanently
 * flagging a student who bounced back.
 */
export function detectRecovery(
  regression: RegressionEvent,
  pointsAfterTrough: TimePoint[]
): RecoveryResult {
  const sorted = [...pointsAfterTrough].sort(byTime);
  const latestValue = sorted.length > 0 ? sorted[sorted.length - 1]!.value : regression.troughValue;

  const recoveredFraction =
    regression.magnitude === 0
      ? 1
      : Math.round(((latestValue - regression.troughValue) / regression.magnitude) * 100) / 100;

  if (latestValue >= regression.peakValue - RECOVERY_TOLERANCE) {
    return { status: "RECOVERED", currentValue: latestValue, recoveredFraction: Math.max(recoveredFraction, 1) };
  }
  if (recoveredFraction >= RECOVERING_FRACTION_THRESHOLD) {
    return { status: "RECOVERING", currentValue: latestValue, recoveredFraction };
  }
  return { status: "NOT_RECOVERING", currentValue: latestValue, recoveredFraction };
}
