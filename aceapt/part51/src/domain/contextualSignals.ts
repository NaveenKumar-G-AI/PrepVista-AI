import type { AccuracyResult } from "../types/accuracy.js";

/** Tunable gap thresholds (percentage points). Each is named after the §-section it backs. */
export const SIGNAL_THRESHOLDS = {
  /** §18/§57, tests §123/§124. */
  speedAccuracyDropPts: 5,
  /** §19/§58, test §125. */
  noveltyGapPts: 10,
  /** §20/§59, test §126. */
  assistanceGapPts: 10,
  /** §17, test §127 — framing only, never "global weakness" (§17). */
  difficultyGapPts: 15,
  /** §21, test §128. */
  sessionPositionDropPts: 10
} as const;

export type SpeedAccuracySignal = "PRESSURE_REDUCTION_SIGNAL" | "PACE_INCREASE_OK_SIGNAL" | null;

/**
 * §57 — "If speed improves but accuracy drops: Feature 51 sends REDUCE
 * PRESSURE. If accuracy remains stable: Feature 50 may increase pace."
 * Only meaningful when pace actually changed — a signal here says nothing
 * about a student whose pace was untouched.
 */
export function evaluateSpeedAccuracy(
  priorAccuracyPct: number,
  currentAccuracyPct: number,
  paceGotFaster: boolean
): { signal: SpeedAccuracySignal; dropPts: number; reason: string } {
  if (!paceGotFaster) {
    return { signal: null, dropPts: 0, reason: "Pace has not changed meaningfully; no speed/accuracy comparison to make." };
  }
  const dropPts = Math.round((priorAccuracyPct - currentAccuracyPct) * 10) / 10;
  if (dropPts >= SIGNAL_THRESHOLDS.speedAccuracyDropPts) {
    return {
      signal: "PRESSURE_REDUCTION_SIGNAL",
      dropPts,
      reason: `Accuracy dropped ${dropPts} points as pace increased — recommend easing pace pressure before pushing speed further.`
    };
  }
  return {
    signal: "PACE_INCREASE_OK_SIGNAL",
    dropPts,
    reason: `Accuracy held (±${Math.abs(dropPts)} points) as pace increased — the faster pace looks sustainable.`
  };
}

/** §19/§58 — never invokes "memorization" at all, positively or negatively; that interpretation belongs to Feature 49. */
export function evaluateNoveltyAccuracy(
  familiarAccuracyPct: number,
  novelAccuracyPct: number
): { signal: "TRANSFER_PRECISION_SIGNAL" | null; gapPts: number; reason: string } {
  const gapPts = Math.round((familiarAccuracyPct - novelAccuracyPct) * 10) / 10;
  if (gapPts >= SIGNAL_THRESHOLDS.noveltyGapPts) {
    return {
      signal: "TRANSFER_PRECISION_SIGNAL",
      gapPts,
      reason: `Accuracy on familiar problems (${familiarAccuracyPct}%) is ${gapPts} points above novel-form problems (${novelAccuracyPct}%) — worth targeted practice on applying this skill to unfamiliar structures.`
    };
  }
  return { signal: null, gapPts, reason: "Familiar and novel accuracy are close — no transfer gap detected yet." };
}

/** §20/§59 — distinguishes "correct with help" from "correct independently". */
export function evaluateAssistanceAccuracy(
  guidedAccuracyPct: number,
  independentAccuracyPct: number
): { signal: "ASSISTANCE_DEPENDENCY_SIGNAL" | null; gapPts: number; reason: string } {
  const gapPts = Math.round((guidedAccuracyPct - independentAccuracyPct) * 10) / 10;
  if (gapPts >= SIGNAL_THRESHOLDS.assistanceGapPts) {
    return {
      signal: "ASSISTANCE_DEPENDENCY_SIGNAL",
      gapPts,
      reason: `Accuracy with guidance (${guidedAccuracyPct}%) is ${gapPts} points above independent accuracy (${independentAccuracyPct}%) — performance may be leaning on assistance.`
    };
  }
  return { signal: null, gapPts, reason: "Guided and independent accuracy are close — no assistance-dependency gap detected." };
}

/** §17 — descriptive framing only; never characterizes the pattern as a sweeping/global weakness. */
export function describeDifficultyPattern(byDifficulty: AccuracyResult[]): {
  complexityRelatedDegradation: boolean;
  reason: string;
} {
  const easy = byDifficulty.find((r) => r.scopeId === "easy");
  const hard = byDifficulty.find((r) => r.scopeId === "hard");
  if (!easy?.accuracy || !hard?.accuracy) {
    return { complexityRelatedDegradation: false, reason: "Not enough evidence across difficulty levels yet." };
  }
  const gapPts = Math.round((easy.accuracy - hard.accuracy) * 10) / 10;
  if (gapPts >= SIGNAL_THRESHOLDS.difficultyGapPts) {
    return {
      complexityRelatedDegradation: true,
      reason: `Accuracy drops ${gapPts} points from easy (${easy.accuracy}%) to hard (${hard.accuracy}%) — accuracy here tracks problem complexity rather than this skill overall.`
    };
  }
  return { complexityRelatedDegradation: false, reason: "Accuracy is reasonably consistent across difficulty levels." };
}

/** §21 — "Consider fatigue/time. Do not claim causality automatically." */
export function describeSessionPositionPattern(bySessionPosition: AccuracyResult[]): {
  lateSessionDrop: boolean;
  reason: string;
} {
  const early = bySessionPosition.find((r) => r.scopeId === "early");
  const late = bySessionPosition.find((r) => r.scopeId === "late");
  if (!early?.accuracy || !late?.accuracy) {
    return { lateSessionDrop: false, reason: "Not enough evidence across the session to compare early vs. late accuracy yet." };
  }
  const gapPts = Math.round((early.accuracy - late.accuracy) * 10) / 10;
  if (gapPts >= SIGNAL_THRESHOLDS.sessionPositionDropPts) {
    return {
      lateSessionDrop: true,
      reason: `Accuracy drops ${gapPts} points from early (${early.accuracy}%) to late (${late.accuracy}%) in the session — a potential late-session accuracy drop worth watching (fatigue or time pressure are plausible factors, not confirmed causes).`
    };
  }
  return { lateSessionDrop: false, reason: "No meaningful accuracy drop across the session so far." };
}
