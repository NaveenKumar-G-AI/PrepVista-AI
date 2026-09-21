import type { GrowthEvidence } from "../types.ts";
import { GrowthConfig } from "../config.ts";
import { daysAgo, sortByOccurredAt } from "../utils.ts";

export interface RetentionResult {
  retentionEvidenceCount: number;
  retentionSuccessCount: number;
  /** True only when a retention success followed a genuine gap in
   * practice — routine back-to-back practice never counts as a retention
   * demonstration, no matter how the source system tagged it, because the
   * whole point of retention evidence is "did it survive NOT being
   * practiced". */
  confirmedRetention: boolean;
}

export function analyzeRetention(dimensionEvidence: GrowthEvidence[], now: Date = new Date()): RetentionResult {
  const sorted = sortByOccurredAt(dimensionEvidence);
  const retentionChecks = sorted.filter((e) => e.isRetentionCheck);

  let confirmed = false;
  for (const check of retentionChecks) {
    if (check.outcome !== "SUCCESS") continue;
    const priorEvidence = sorted.filter((e) => e !== check && new Date(e.occurredAt) < new Date(check.occurredAt));
    if (priorEvidence.length === 0) continue;
    const mostRecentPrior = priorEvidence[priorEvidence.length - 1]!;
    const gapDays = daysAgo(mostRecentPrior.occurredAt, new Date(check.occurredAt));
    if (gapDays >= GrowthConfig.retention.minGapDaysForRetentionCredit) {
      confirmed = true;
      break;
    }
  }

  return {
    retentionEvidenceCount: retentionChecks.length,
    retentionSuccessCount: retentionChecks.filter((e) => e.outcome === "SUCCESS").length,
    confirmedRetention: confirmed,
  };
}
