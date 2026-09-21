import type { DifficultyLevel, EvidenceRecord } from "./types.js";

export interface EvidenceAggregate {
  evidenceCount: number;
  diversityCount: number;
  averageQualityTier: number | null;
  /** Chronologically sorted (timestamp, score) pairs, scored records only.
   *  Used for consistency/trend statistics - never for classification. */
  scoreSeries: { timestamp: string; score: number }[];
  daysSinceLastEvidence: number | null;
  latestAt: string | null;
  oldestAt: string | null;
  maxDifficultyObserved: DifficultyLevel | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Summarizes a skill's raw evidence into the shape the rest of the engine
 * needs. Pure function of the input records and `now` (injectable for
 * deterministic tests).
 */
export function aggregateEvidence(
  records: EvidenceRecord[],
  now: Date = new Date(),
): EvidenceAggregate {
  if (records.length === 0) {
    return {
      evidenceCount: 0,
      diversityCount: 0,
      averageQualityTier: null,
      scoreSeries: [],
      daysSinceLastEvidence: null,
      latestAt: null,
      oldestAt: null,
      maxDifficultyObserved: null,
    };
  }

  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const diversityKeys = new Set(records.map((r) => r.taskId ?? `${r.sourceType}:${r.taskType ?? "n/a"}`));
  const averageQualityTier =
    records.reduce((sum, r) => sum + r.qualityTier, 0) / records.length;

  const scoreSeries = sorted
    .filter((r): r is EvidenceRecord & { rawScore: number } => typeof r.rawScore === "number")
    .map((r) => ({ timestamp: r.timestamp, score: r.rawScore }));

  const daysSinceLastEvidence = Math.max(
    0,
    Math.floor((now.getTime() - new Date(last.timestamp).getTime()) / DAY_MS),
  );

  const maxDifficultyObserved = records.reduce<DifficultyLevel | null>(
    (max, r) => (max === null || r.difficulty > max ? r.difficulty : max),
    null,
  );

  return {
    evidenceCount: records.length,
    diversityCount: diversityKeys.size,
    averageQualityTier,
    scoreSeries,
    daysSinceLastEvidence,
    latestAt: last.timestamp,
    oldestAt: first.timestamp,
    maxDifficultyObserved,
  };
}
