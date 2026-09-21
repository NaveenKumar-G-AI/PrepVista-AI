import type { AttemptRecord } from "../types/accuracy.js";
import type { ErrorType, RecurrenceStatus } from "../types/errorTaxonomy.js";

/**
 * Tunable thresholds. §53 gives a worked example verbatim ("3 previous
 * errors... then 5 independent successful variants... now resolved") — used
 * here as the literal default rather than an invented number, and §119/§120
 * are written as unit tests against exactly these constants.
 */
export const RECURRENCE_THRESHOLDS = {
  /** §119: "Same mistake appears three times. Expected: priority rises." */
  minOccurrencesForRecurring: 3,
  /** §53: prior errors required before resolution can even be considered. */
  minPriorErrorsForResolution: 3,
  /** §53: independent successful variants required, since the last occurrence. */
  minIndependentSuccessesForResolution: 5,
  /** §12 "recent_frequency" / §39 "high-risk checking" window. */
  recentWindowSize: 10,
  /** §13 cluster detection: distinct error types, each with >= this many hits, within the recent window. */
  minOccurrencesPerClusterMember: 2,
  minDistinctTypesForCluster: 2
} as const;

export interface ErrorLifecycle {
  errorType: ErrorType;
  frequency: number; // §12 all-time occurrences within the supplied window
  recentFrequency: number; // §12 occurrences within the most recent N same-skill attempts
  streak: number; // §12 consecutive most-recent same-skill attempts that are this error
  firstSeen: string | null;
  lastSeen: string | null;
  correctionRate: number | null; // §110 recovery rate (any corrective attempt)
  independentCorrectionRate: number | null; // §110 recovery rate (independent only)
  successesSinceLastOccurrence: number;
  wasEverResolved: boolean;
  regressedAtLastOccurrence: boolean; // true if the MOST RECENT occurrence broke a prior resolution
}

/**
 * Walks a single skill's attempt history (already filtered to
 * questionValid === true, per §129/§87 — invalid questions never contaminate
 * accuracy or recurrence evidence) in chronological order and reconstructs
 * one error type's lifecycle: how often it happens, whether it has ever been
 * resolved, and whether the most recent occurrence represents a regression
 * against a prior resolution (§52). Nothing here is erased on regression —
 * `frequency`/`firstSeen` still reflect full history, per §52's "do not
 * erase historical evidence".
 */
export function computeErrorLifecycle(
  chronologicalSkillAttempts: AttemptRecord[],
  errorType: ErrorType,
  thresholds = RECURRENCE_THRESHOLDS
): ErrorLifecycle {
  const occurrenceTimestamps: string[] = [];
  let successesSinceLast = 0;
  let correctedCount = 0;
  let independentCorrectedCount = 0;
  let regressedAtLastOccurrence = false;
  let sawResolutionBeforeCurrentOccurrence = false;
  let pendingCorrectionForOpenOccurrence = false;
  let pendingIndependentCorrectionForOpenOccurrence = false;

  for (const attempt of chronologicalSkillAttempts) {
    const isThisError = !attempt.isCorrect && attempt.errorType === errorType;

    if (isThisError) {
      const alreadyResolved =
        occurrenceTimestamps.length >= thresholds.minPriorErrorsForResolution &&
        successesSinceLast >= thresholds.minIndependentSuccessesForResolution;

      regressedAtLastOccurrence = alreadyResolved; // true only if THIS occurrence broke a resolution
      if (alreadyResolved) sawResolutionBeforeCurrentOccurrence = true;

      if (occurrenceTimestamps.length > 0) {
        if (pendingCorrectionForOpenOccurrence) correctedCount++;
        if (pendingIndependentCorrectionForOpenOccurrence) independentCorrectedCount++;
      }

      occurrenceTimestamps.push(attempt.createdAt);
      successesSinceLast = 0;
      pendingCorrectionForOpenOccurrence = false;
      pendingIndependentCorrectionForOpenOccurrence = false;
    } else if (attempt.isCorrect) {
      successesSinceLast += attempt.hintLevel === "independent" ? 1 : 0;
      pendingCorrectionForOpenOccurrence = true;
      if (attempt.hintLevel === "independent") pendingIndependentCorrectionForOpenOccurrence = true;
    }
  }

  // Close out the final occurrence's correction bookkeeping against whatever
  // came after it (up to "now" = end of the supplied window).
  if (occurrenceTimestamps.length > 0) {
    if (pendingCorrectionForOpenOccurrence) correctedCount++;
    if (pendingIndependentCorrectionForOpenOccurrence) independentCorrectedCount++;
  }

  const recentWindow = chronologicalSkillAttempts.slice(-thresholds.recentWindowSize);
  const recentFrequency = recentWindow.filter(
    (a) => !a.isCorrect && a.errorType === errorType
  ).length;

  let streak = 0;
  for (let i = chronologicalSkillAttempts.length - 1; i >= 0; i--) {
    const a = chronologicalSkillAttempts[i]!;
    if (!a.isCorrect && a.errorType === errorType) streak++;
    else break;
  }

  const frequency = occurrenceTimestamps.length;
  const resolvedAsOfNow =
    frequency >= thresholds.minPriorErrorsForResolution &&
    successesSinceLast >= thresholds.minIndependentSuccessesForResolution;

  return {
    errorType,
    frequency,
    recentFrequency,
    streak,
    firstSeen: occurrenceTimestamps[0] ?? null,
    lastSeen: occurrenceTimestamps[occurrenceTimestamps.length - 1] ?? null,
    correctionRate: frequency > 0 ? correctedCount / frequency : null,
    independentCorrectionRate: frequency > 0 ? independentCorrectedCount / frequency : null,
    successesSinceLastOccurrence: successesSinceLast,
    wasEverResolved: sawResolutionBeforeCurrentOccurrence || resolvedAsOfNow,
    regressedAtLastOccurrence
  };
}

export interface ErrorCluster {
  clusterId: string; // deterministic slug, e.g. "percentage-accuracy-cluster"
  skillId: string;
  memberErrorTypes: ErrorType[];
  totalOccurrences: number;
}

/**
 * §13 — several related error types recurring together within the same
 * skill. Local default heuristic (grouping only; no causal claim — §13
 * "Do not claim causality without evidence"). Swappable via
 * ErrorPatternIntelligencePort for a real cross-skill semantic clustering
 * engine later.
 */
export function detectErrorClusters(
  skillId: string,
  chronologicalSkillAttempts: AttemptRecord[],
  thresholds = RECURRENCE_THRESHOLDS
): ErrorCluster | null {
  const recentWindow = chronologicalSkillAttempts.slice(-thresholds.recentWindowSize);
  const counts = new Map<ErrorType, number>();
  for (const a of recentWindow) {
    if (!a.isCorrect && a.errorType) counts.set(a.errorType, (counts.get(a.errorType) ?? 0) + 1);
  }
  const members = [...counts.entries()].filter(
    ([, n]) => n >= thresholds.minOccurrencesPerClusterMember
  );
  if (members.length < thresholds.minDistinctTypesForCluster) return null;

  const memberErrorTypes = members.map(([type]) => type).sort();
  return {
    clusterId: `${skillId}:${memberErrorTypes.join("+")}`.toLowerCase(),
    skillId,
    memberErrorTypes,
    totalOccurrences: members.reduce((sum, [, n]) => sum + n, 0)
  };
}

/**
 * Combines an error type's lifecycle with cluster membership into the single
 * §11 status. Precedence: a live regression is the most actionable signal,
 * then a genuine resolution, then cluster membership (more specific than
 * plain "recurring"), then recurring vs. isolated by raw frequency.
 */
export function classifyRecurrenceStatus(
  lifecycle: ErrorLifecycle,
  isPartOfCluster: boolean,
  thresholds = RECURRENCE_THRESHOLDS
): RecurrenceStatus {
  const resolvedAsOfNow =
    lifecycle.frequency >= thresholds.minPriorErrorsForResolution &&
    lifecycle.successesSinceLastOccurrence >= thresholds.minIndependentSuccessesForResolution;

  if (resolvedAsOfNow) return "resolved";
  if (lifecycle.regressedAtLastOccurrence) return "regressed";
  if (isPartOfCluster) return "clustered";
  if (lifecycle.frequency >= thresholds.minOccurrencesForRecurring) return "recurring";
  return "isolated";
}
