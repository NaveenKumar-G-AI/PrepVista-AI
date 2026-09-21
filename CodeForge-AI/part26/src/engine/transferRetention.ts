import type { AggregationResult, NormalizedEvidence } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

/** Transfer confidence is 0 (not "unknown") when there is no transfer-tagged evidence yet —
 * that IS the honest answer: we have not seen this student apply the skill outside its
 * original pattern (req #17/#30). Evidence count is reported alongside so callers/explanations
 * can distinguish "demonstrated poor transfer" from "never tested for transfer". */
export function computeTransferConfidence(agg: AggregationResult): number {
  if (agg.transferEvidenceCount < SignalPolicy.transfer.minEvidenceForTransferSignal) return 0;
  return agg.transferWeightedSignal ?? 0;
}

/**
 * Looks for a genuine "gap then recheck" pattern in the skill's evidence timeline:
 * a period of silence at least minGapDaysForRetentionCheck long, followed by new
 * evidence. Retention is read from that post-gap evidence only. No such pattern ->
 * null, meaning "not enough data to assess retention" rather than a guessed number
 * (req #29).
 */
export function computeRetention(evidenceForSkill: NormalizedEvidence[]): number | null {
  if (evidenceForSkill.length < 2) return null;
  const sorted = [...evidenceForSkill].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const minGapDays = SignalPolicy.retention.minGapDaysForRetentionCheck;

  let lastGapIndex = -1;
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = (Date.parse(sorted[i].occurredAt) - Date.parse(sorted[i - 1].occurredAt)) / (1000 * 60 * 60 * 24);
    if (gapDays >= minGapDays) lastGapIndex = i;
  }
  if (lastGapIndex === -1) return null;

  const postGap = sorted.slice(lastGapIndex);
  const avg = postGap.reduce((s, e) => s + e.normalizedValue, 0) / postGap.length;
  return avg;
}
