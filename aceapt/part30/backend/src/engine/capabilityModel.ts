import type { CapabilityDimensions, EvidenceResult, EvidenceType, StudentCapabilityState } from "../domain/types.js";

/**
 * How the four evidence dimensions (Section 11, 20-21) roll up into the
 * single composite `level` PATH compares against a target's required
 * level. Accuracy and transfer carry the most weight because they reflect
 * whether the capability actually works, not just whether it's fast or
 * repeatable; speed and consistency are exam-condition refinements on top
 * of that. Documented here (rather than left as a magic number) because
 * every downstream bottleneck/readiness number depends on this choice.
 */
export const DIMENSION_WEIGHTS: Record<keyof CapabilityDimensions, number> = {
  accuracy: 0.3,
  transfer: 0.3,
  speed: 0.25,
  consistency: 0.15,
};

export function compositeLevel(dims: CapabilityDimensions): number {
  return (
    dims.accuracy * DIMENSION_WEIGHTS.accuracy +
    dims.transfer * DIMENSION_WEIGHTS.transfer +
    dims.speed * DIMENSION_WEIGHTS.speed +
    dims.consistency * DIMENSION_WEIGHTS.consistency
  );
}

/**
 * Folds one new evidence event into a running capability state using an
 * exponential moving average (recent evidence matters more, but a single
 * lucky attempt can't swing the number wildly -- Section 26's
 * INCONSISTENT_PERFORMANCE risk exists precisely because single-attempt
 * swings are not trustworthy signal). alpha=0.35 means roughly the last
 * 3-4 attempts dominate the current read, which is deliberately close to
 * how a human coach would weigh "how's this student doing right now".
 */
const EMA_ALPHA = 0.35;

export function applyEvidence(
  prior: StudentCapabilityState | null,
  studentId: string,
  capabilityCode: string,
  type: EvidenceType,
  result: EvidenceResult
): StudentCapabilityState {
  const base: CapabilityDimensions = prior
    ? { accuracy: prior.accuracy, speed: prior.speed, transfer: prior.transfer, consistency: prior.consistency }
    : { accuracy: 0, speed: 0, transfer: 0, consistency: 0 };

  const accuracyObserved =
    result.total && result.total > 0 ? (100 * (result.correct ?? 0)) / result.total : undefined;

  // LEARNING evidence (a worked example, a concept check) is real signal but
  // weaker than a graded PRACTICE/PERFORMANCE/TRANSFER attempt -- Section 7's
  // own evidence hierarchy ranks it first and lightest. Rather than ignore
  // it or weight it identically to a timed test, it moves accuracy at a
  // fraction of the normal step size.
  const accuracyAlpha = type === "LEARNING" ? EMA_ALPHA * 0.5 : EMA_ALPHA;

  const speedObserved =
    result.timeAllowedSeconds && result.timeAllowedSeconds > 0 && result.timeTakenSeconds != null
      ? clamp(100 * (result.timeAllowedSeconds / Math.max(result.timeTakenSeconds, 1)), 0, 100)
      : undefined;

  const transferObserved =
    accuracyObserved != null && result.contextNovelty
      ? result.contextNovelty === "NOVEL"
        ? accuracyObserved
        : undefined // seen-context attempts don't move the transfer needle either way
      : undefined;

  // Consistency looks at how far this attempt's accuracy is from the running
  // average, not at the attempt in isolation -- a single great or terrible
  // attempt should barely move it; a sustained pattern should.
  const consistencyObserved =
    accuracyObserved != null && prior
      ? clamp(100 - Math.abs(accuracyObserved - prior.accuracy), 0, 100)
      : accuracyObserved != null
        ? 50 // no history yet -- neutral prior, first attempt can't prove consistency either way
        : undefined;

  const next: CapabilityDimensions = {
    accuracy: ema(base.accuracy, accuracyObserved, accuracyAlpha),
    // Speed and transfer move whenever the evidence itself carries the
    // signal they need (timing fields; a novel-context attempt) --
    // regardless of which action type the student came from. Gating on
    // `type` instead of on the data actually present created a dead end:
    // a capability whose bottleneck dimension is speed could get
    // recommended a PRACTICE action, complete it with timing data, and
    // still never move -- see the "Bugs found and fixed" section in the README.
    speed: speedObserved != null ? ema(base.speed, speedObserved) : base.speed,
    transfer: transferObserved != null ? ema(base.transfer, transferObserved) : base.transfer,
    consistency: ema(base.consistency, consistencyObserved),
  };

  return {
    studentId,
    capabilityCode,
    ...next,
    level: compositeLevel(next),
    evidenceCount: (prior?.evidenceCount ?? 0) + 1,
    lastEvidenceAt: new Date().toISOString(),
  };
}

function ema(prior: number, observed: number | undefined, alpha: number = EMA_ALPHA): number {
  if (observed == null) return prior;
  return prior === 0 ? observed : prior * (1 - alpha) + observed * alpha;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
