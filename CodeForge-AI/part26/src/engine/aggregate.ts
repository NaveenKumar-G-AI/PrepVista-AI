import { EvidenceStatus, type AggregationResult, type NormalizedEvidence } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / (1000 * 60 * 60 * 24);
}

function recencyWeight(occurredAt: string, nowIso: string): number {
  const ageDays = Math.max(0, daysBetween(occurredAt, nowIso));
  const halfLife = SignalPolicy.aggregation.recencyHalfLifeDays;
  return Math.pow(0.5, ageDays / halfLife);
}

function weightOf(e: NormalizedEvidence, nowIso: string): number {
  // difficulty weight: harder, well-calibrated evidence counts more (req. #38, #61)
  const difficultyWeight = 0.5 + 0.5 * e.difficulty;
  return recencyWeight(e.occurredAt, nowIso) * difficultyWeight * e.sourceReliability * e.independence;
}

function weightedAverage(entries: Array<{ value: number; weight: number }>): number | null {
  const totalWeight = entries.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) return null;
  return entries.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight;
}

/**
 * Aggregates all VALID evidence for one (student, skill) pair. Excludes
 * INVALID/EXCLUDED/DISPUTED evidence entirely (req. #34); SUSPICIOUS evidence
 * is counted for context but heavily downweighted rather than silently trusted.
 */
export function aggregateEvidence(
  allEvidence: NormalizedEvidence[],
  studentId: string,
  skillId: string,
  nowIso: string
): AggregationResult {
  const forSkill = allEvidence.filter((e) => e.studentId === studentId && e.skillId === skillId);
  const excluded = forSkill.filter((e) => e.status === EvidenceStatus.EXCLUDED || e.status === EvidenceStatus.INVALID || e.status === EvidenceStatus.DISPUTED);
  const usable = forSkill.filter((e) => e.status === EvidenceStatus.VALID || e.status === EvidenceStatus.SUSPICIOUS);

  if (usable.length === 0) {
    return {
      skillId,
      studentId,
      evidenceCount: forSkill.length,
      validEvidenceCount: 0,
      weightedSignal: 0,
      recentWeightedSignal: null,
      historicalWeightedSignal: null,
      diversity: 0,
      distinctContexts: 0,
      transferEvidenceCount: 0,
      transferWeightedSignal: null,
      lastDemonstratedAt: null,
      firstObservedAt: null,
      avgSourceReliability: 0,
      contradictionMagnitude: 0,
      excludedCount: excluded.length,
    };
  }

  const weighted = usable.map((e) => ({
    e,
    weight: weightOf(e, nowIso) * (e.status === EvidenceStatus.SUSPICIOUS ? 0.25 : 1),
  }));

  const overallSignal = weightedAverage(weighted.map((w) => ({ value: w.e.normalizedValue, weight: w.weight }))) ?? 0;

  const recentCutoffDays = SignalPolicy.aggregation.recentWindowDays;
  const recent = weighted.filter((w) => daysBetween(w.e.occurredAt, nowIso) <= recentCutoffDays);
  const historical = weighted.filter((w) => daysBetween(w.e.occurredAt, nowIso) > recentCutoffDays);

  const recentSignal = weightedAverage(recent.map((w) => ({ value: w.e.normalizedValue, weight: w.weight })));
  const historicalSignal = weightedAverage(historical.map((w) => ({ value: w.e.normalizedValue, weight: w.weight })));

  // Contradiction: recent evidence diverges sharply from established historical evidence,
  // AND both sides have real support (not one lonely data point vs. a big history) — req. #22.
  let contradictionMagnitude = 0;
  if (recentSignal !== null && historicalSignal !== null && historical.length >= 2) {
    const divergence = Math.abs(recentSignal - historicalSignal);
    contradictionMagnitude = divergence > 0.25 ? Math.min(1, divergence) : 0;
  }

  const distinctContexts = new Set(usable.map((e) => e.contextGroup)).size;
  const diversity = Math.min(1, distinctContexts / SignalPolicy.diversity.targetDistinctContexts);

  const transferEntries = weighted.filter((w) => w.e.isTransfer);
  const transferWeightedSignal =
    transferEntries.length > 0
      ? weightedAverage(transferEntries.map((w) => ({ value: w.e.normalizedValue, weight: w.weight })))
      : null;

  const occurredTimestamps = usable.map((e) => e.occurredAt).sort();
  const avgSourceReliability = usable.reduce((s, e) => s + e.sourceReliability, 0) / usable.length;

  return {
    skillId,
    studentId,
    evidenceCount: forSkill.length,
    validEvidenceCount: usable.length,
    weightedSignal: overallSignal,
    recentWeightedSignal: recentSignal,
    historicalWeightedSignal: historicalSignal,
    diversity,
    distinctContexts,
    transferEvidenceCount: transferEntries.length,
    transferWeightedSignal,
    lastDemonstratedAt: occurredTimestamps[occurredTimestamps.length - 1] ?? null,
    firstObservedAt: occurredTimestamps[0] ?? null,
    avgSourceReliability,
    contradictionMagnitude,
    excludedCount: excluded.length,
  };
}
