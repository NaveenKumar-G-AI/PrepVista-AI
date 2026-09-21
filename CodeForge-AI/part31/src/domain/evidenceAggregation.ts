import type {
  Difficulty,
  EvidenceRecord,
  EvidenceStrengthTier,
  MasteryLevel,
  SkillSignal,
} from './types';
import {
  CONSISTENCY_MIN_SAMPLE,
  CONSISTENCY_STDDEV_THRESHOLD,
  CONSISTENCY_WINDOW,
  DIFFICULTY_PASS_BAR,
  DIFFICULTY_RANK,
  DIFFICULTY_WEIGHT,
  EVIDENCE_TIER_RANK,
  EVIDENCE_TIER_WEIGHT,
  MASTERY_CUTPOINTS,
  RECENCY_HALF_LIFE_DAYS,
  RECENCY_MIN_WEIGHT,
  TREND_DELTA_THRESHOLD,
  TREND_WINDOW,
} from './config';

function tierRank(tier: EvidenceStrengthTier): number {
  return EVIDENCE_TIER_RANK.indexOf(tier);
}

function recencyWeight(timestamp: string, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(timestamp).getTime()) / 86_400_000);
  const w = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return Math.max(RECENCY_MIN_WEIGHT, w);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function scoreToMastery(score: number): Exclude<MasteryLevel, 'unassessed'> {
  for (const cp of MASTERY_CUTPOINTS) {
    if (score >= cp.min) return cp.level;
  }
  return 'emerging';
}

export interface EvidenceRequirementLike {
  minEvidenceCount: number;
  minTier: EvidenceStrengthTier;
}

export interface AggregationOptions {
  now?: Date;
  /** Phase 49 — mark a skill as having an unavailable evidence source this run, distinct from genuinely-no-evidence. */
  dataAvailability?: 'ok' | 'source_unavailable';
}

/**
 * Aggregates verified evidence for one skill into a SkillSignal.
 *
 * Key invariant (Phase 7): zero evidence never becomes a numeric failure.
 * `status` is the authority on how much to trust `mastery` — callers must
 * check `status` before treating `mastery` as meaningful, and must never
 * render an unassessed/insufficient skill as if it were a measured "weak"
 * score.
 */
export function aggregateSkillEvidence(
  skillId: string,
  evidence: EvidenceRecord[],
  requirement: EvidenceRequirementLike,
  options: AggregationOptions = {},
): SkillSignal {
  const now = options.now ?? new Date();
  const dataAvailability = options.dataAvailability ?? 'ok';
  const skillEvidence = evidence.filter((e) => e.skillId === skillId && e.verified);

  if (skillEvidence.length === 0) {
    return {
      skillId,
      status: 'unassessed',
      mastery: 'unassessed',
      masteryScoreEstimate: null,
      evidenceCount: 0,
      qualifyingEvidenceCount: 0,
      distinctTaskTypes: 0,
      distinctDifficulties: 0,
      recencyScore: 0,
      consistency: 'insufficient_sample',
      trend: 'insufficient_data',
      mostRecentEvidenceAt: null,
      highestDifficultyPassed: null,
      dataAvailability,
      contributingEvidenceIds: [],
    };
  }

  const minRank = tierRank(requirement.minTier);
  const qualifying = skillEvidence.filter((e) => tierRank(e.tier) >= minRank);

  const sortedByRecency = [...skillEvidence].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const mostRecentEvidenceAt = sortedByRecency[0].timestamp;

  // Mastery estimate draws on ALL verified evidence (tier weight already
  // discounts weaker tiers) so a skill isn't blind to understanding-only
  // signals — but `status` below is what actually gates whether it counts
  // as "assessed", and status only looks at *qualifying* evidence.
  let numerator = 0;
  let denominator = 0;
  for (const e of skillEvidence) {
    const w = EVIDENCE_TIER_WEIGHT[e.tier] * DIFFICULTY_WEIGHT[e.difficulty] * recencyWeight(e.timestamp, now);
    numerator += w * e.rawScore;
    denominator += w;
  }
  const masteryScoreEstimate = denominator > 0 ? numerator / denominator : null;

  const avgRecencyWeight =
    skillEvidence.reduce((s, e) => s + recencyWeight(e.timestamp, now), 0) / skillEvidence.length;

  const distinctTaskTypes = new Set(skillEvidence.map((e) => e.taskType)).size;
  const distinctDifficulties = new Set(skillEvidence.map((e) => e.difficulty)).size;

  let highestDifficultyPassed: Difficulty | null = null;
  for (const d of [...DIFFICULTY_RANK].reverse()) {
    if (skillEvidence.some((e) => e.difficulty === d && e.rawScore >= DIFFICULTY_PASS_BAR)) {
      highestDifficultyPassed = d;
      break;
    }
  }

  const recentQualifying = [...qualifying]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, CONSISTENCY_WINDOW);

  let consistency: SkillSignal['consistency'] = 'insufficient_sample';
  let consistencyDetail: SkillSignal['consistencyDetail'];
  if (recentQualifying.length >= CONSISTENCY_MIN_SAMPLE) {
    const sd = stddev(recentQualifying.map((e) => e.rawScore));
    consistency = sd <= CONSISTENCY_STDDEV_THRESHOLD ? 'stable' : 'unstable';
    consistencyDetail = { stddev: Math.round(sd * 10) / 10, sampleSize: recentQualifying.length };
  }

  const chronological = [...qualifying].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let trend: SkillSignal['trend'] = 'insufficient_data';
  if (chronological.length >= TREND_WINDOW * 2) {
    const recent = chronological.slice(-TREND_WINDOW);
    const prior = chronological.slice(-TREND_WINDOW * 2, -TREND_WINDOW);
    const recentAvg = recent.reduce((s, e) => s + e.rawScore, 0) / recent.length;
    const priorAvg = prior.reduce((s, e) => s + e.rawScore, 0) / prior.length;
    const delta = recentAvg - priorAvg;
    trend = delta > TREND_DELTA_THRESHOLD ? 'improving' : delta < -TREND_DELTA_THRESHOLD ? 'declining' : 'stable';
  }

  const status: SkillSignal['status'] =
    qualifying.length === 0 || qualifying.length < requirement.minEvidenceCount
      ? 'insufficient_evidence'
      : 'assessed';

  const mastery: MasteryLevel = masteryScoreEstimate === null ? 'unassessed' : scoreToMastery(masteryScoreEstimate);

  return {
    skillId,
    status,
    mastery,
    masteryScoreEstimate,
    evidenceCount: skillEvidence.length,
    qualifyingEvidenceCount: qualifying.length,
    distinctTaskTypes,
    distinctDifficulties,
    recencyScore: avgRecencyWeight,
    consistency,
    consistencyDetail,
    trend,
    mostRecentEvidenceAt,
    highestDifficultyPassed,
    dataAvailability,
    contributingEvidenceIds: skillEvidence.map((e) => e.id),
  };
}
