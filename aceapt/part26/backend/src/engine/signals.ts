import {
  EvidenceConfidence,
  Momentum,
  SessionActionResult,
  Stability
} from "../types";
import {
  FATIGUE_ACCURACY_DROP,
  FATIGUE_MIN_ACTIONS,
  FATIGUE_TIME_INCREASE_RATIO,
  HIGH_SAMPLE_SIZE,
  LOW_SAMPLE_SIZE,
  METHOD_ERROR_MIN_OCCURRENCES,
  METHOD_ERROR_WINDOW,
  MOMENTUM_DECLINING_DIFF,
  MOMENTUM_IMPROVING_DIFF,
  REGRESSION_DROP_THRESHOLD,
  REGRESSION_POSSIBLE_CAUSES,
  STABILITY_MAX_STDEV,
  STABILITY_MIN_SCORE
} from "./constants";

/**
 * How much evidence backs this topic. Section 18: don't let a thin sample
 * drive a big decision - gate everything else behind this first.
 */
export function computeConfidence(sampleSize: number): EvidenceConfidence {
  if (sampleSize < LOW_SAMPLE_SIZE) return "LOW";
  if (sampleSize >= HIGH_SAMPLE_SIZE) return "HIGH";
  return "MEDIUM";
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * Momentum compares the average of the first half of recent scores to the
 * average of the second half. Section 21: "momentum is a signal, not a
 * diagnosis" - so a mild negative drift that doesn't cross the DECLINING
 * threshold is still surfaced as a trend note rather than silently dropped.
 * Needs at least 4 points; fewer than that and any slope is just noise.
 */
export function computeMomentum(recentScores: number[]): { momentum: Momentum; trendNote: string | null } {
  if (recentScores.length < 4) {
    return { momentum: "UNKNOWN", trendNote: null };
  }
  const half = Math.floor(recentScores.length / 2);
  const first = recentScores.slice(0, half);
  const last = recentScores.slice(recentScores.length - half);
  const diff = mean(last) - mean(first);

  if (diff >= MOMENTUM_IMPROVING_DIFF) {
    return { momentum: "IMPROVING", trendNote: null };
  }
  if (diff <= MOMENTUM_DECLINING_DIFF) {
    return { momentum: "DECLINING", trendNote: null };
  }
  if (diff < 0) {
    return {
      momentum: "FLAT",
      trendNote: "Holding steady but drifting slightly down - worth watching, not yet acting on."
    };
  }
  return { momentum: "FLAT", trendNote: null };
}

/**
 * Repeated successful evidence should reduce repetitive testing (section 19).
 * Needs at least 3 points to say anything.
 */
export function computeStability(recentScores: number[]): Stability {
  if (recentScores.length < 3) return "UNKNOWN";
  const lastThree = recentScores.slice(-3);
  const allHigh = lastThree.every((s) => s >= STABILITY_MIN_SCORE);
  const tight = stdev(lastThree) <= STABILITY_MAX_STDEV;
  return allHigh && tight ? "STABLE" : "UNSTABLE";
}

/**
 * A sudden drop needs investigating before it's called a regression
 * (section 20) - this flags it and lists hypotheses, it never concludes one.
 * Needs at least 4 points (1 "recent" + 3 "before").
 */
export function computeRegression(recentScores: number[]): {
  regressionSuspected: boolean;
  possibleCauses: string[];
} {
  if (recentScores.length < 4) {
    return { regressionSuspected: false, possibleCauses: [] };
  }
  const mostRecent = recentScores[recentScores.length - 1];
  const priorThree = recentScores.slice(recentScores.length - 4, recentScores.length - 1);
  const drop = mean(priorThree) - mostRecent;
  if (drop > REGRESSION_DROP_THRESHOLD) {
    return { regressionSuspected: true, possibleCauses: REGRESSION_POSSIBLE_CAUSES };
  }
  return { regressionSuspected: false, possibleCauses: [] };
}

/**
 * One wrong answer is weak evidence; the same tag recurring across the last
 * few attempts is a pattern worth naming (section 22).
 */
/**
 * One wrong answer is weak evidence; the same tag recurring across the last
 * few attempts is a pattern worth naming (section 22). Severity scales with
 * how much of the recent window the pattern accounts for (3/5 -> 0.6,
 * 5/5 -> 1.0) rather than a flat constant, so it stays evidence-derived.
 */
export function computePersistentErrorPattern(errorTags: string[]): { tag: string | null; severity: number } {
  const recent = errorTags.slice(-METHOD_ERROR_WINDOW);
  const counts = new Map<string, number>();
  for (const tag of recent) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  for (const [tag, count] of counts) {
    if (count >= METHOD_ERROR_MIN_OCCURRENCES) {
      return { tag, severity: count / recent.length };
    }
  }
  return { tag: null, severity: 0 };
}

/**
 * Section 35: accuracy dropping and response time rising together, within
 * one sitting, is a fatigue signal worth surfacing - not a conclusion, and
 * never phrased as a medical claim. Compares the two most recent completed
 * actions in the current session to each other (not to long-run history),
 * since fatigue is about what's happening right now in this sitting.
 */
export function detectFatigue(lastActionResults: SessionActionResult[]): boolean {
  if (lastActionResults.length < FATIGUE_MIN_ACTIONS) return false;
  const [prev, curr] = lastActionResults.slice(-2);
  const accuracyDropped = prev.accuracy - curr.accuracy >= FATIGUE_ACCURACY_DROP;
  const slowedDown = curr.avgResponseTimeSeconds >= prev.avgResponseTimeSeconds * FATIGUE_TIME_INCREASE_RATIO;
  return accuracyDropped && slowedDown;
}
