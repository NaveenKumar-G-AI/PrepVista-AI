import type { GrowthEvidence, TrendDirection } from "../types.ts";
import { distinctChallengeFamilies, sortByOccurredAt } from "../utils.ts";

export interface TransferResult {
  transferEvidenceCount: number;
  transferSuccessCount: number;
  distinctTransferFamilies: number;
  trend: TrendDirection;
}

/**
 * A student is not meaningfully stronger merely because they can repeat the
 * same pattern. Transfer evidence is evidence explicitly marked `isTransfer`
 * by the upstream challenge system (i.e. the SAME underlying concept in a
 * different representation/context/constraint set) — this module counts and
 * trends that evidence, it does not decide what counts as transfer.
 */
export function analyzeTransfer(dimensionEvidence: GrowthEvidence[]): TransferResult {
  const transferEvidence = dimensionEvidence.filter((e) => e.isTransfer);
  const sorted = sortByOccurredAt(transferEvidence);
  const successCount = sorted.filter((e) => e.outcome === "SUCCESS").length;

  let trend: TrendDirection = "UNKNOWN";
  if (sorted.length >= 2) {
    const half = Math.floor(sorted.length / 2);
    const earlierSuccess = sorted.slice(0, half).filter((e) => e.outcome === "SUCCESS").length / Math.max(half, 1);
    const laterSuccess = sorted.slice(half).filter((e) => e.outcome === "SUCCESS").length / Math.max(sorted.length - half, 1);
    trend = laterSuccess > earlierSuccess ? "POSITIVE" : laterSuccess < earlierSuccess ? "NEGATIVE" : "FLAT";
  }

  return {
    transferEvidenceCount: transferEvidence.length,
    transferSuccessCount: successCount,
    distinctTransferFamilies: distinctChallengeFamilies(transferEvidence),
    trend,
  };
}
