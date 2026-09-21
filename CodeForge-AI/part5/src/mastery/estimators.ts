import { config } from '../config/index.js';
import type { Evidence, Trend } from '../types.js';

// =============================================================================
// LANGUAGE-ISSUE FILTERING (Phase 34)
//
// A pure syntax/load error (the code never ran) carries ZERO information
// about algorithmic mastery — the test literally could not assess
// correctness. Such evidence is excluded from mastery/confidence/trend for
// the algorithmic skill entirely (it remains in the historical evidence
// table — Phase 9 — and would, in a fuller build, roll up into the
// student's language-proficiency skill node instead; see
// CODEFORGE_FINAL_REPORT.md limitations).
// =============================================================================

export function filterAlgorithmicEvidence(evidence: Evidence[]): Evidence[] {
  return evidence.filter((e) => !e.languageIssue);
}

// =============================================================================
// MASTERY ESTIMATION (Phase 6)
//
// mastery_score = f(per-evidence weighted average, repeated-mistake penalty,
//                    prerequisite readiness cap)
//
// Each piece of evidence contributes:
//   weight(e) = difficultyWeight(e) * independenceWeight(e) * recencyWeight(e)
// and the score is:
//   weightedAvg = sum(rawScore(e) * weight(e)) / sum(weight(e))
//
// This is NOT `average(score)` — difficulty, independence and recency all
// change how much a given attempt counts, and a repeated-mistake penalty and
// a prerequisite-readiness cap are applied on top. See
// docs/CODEFORGE_MASTERY_MODEL.md for the full write-up with worked numbers.
// =============================================================================

export interface MasteryComputation {
  masteryScore: number;             // 0-100
  weightedAverage: number;          // 0-1, before penalties/caps
  repeatedMistakePenaltyApplied: boolean;
  prerequisiteCapApplied: boolean;
  evidenceCount: number;
  independentSuccessCount: number;
  distinctChallengesCount: number;
}

function recencyWeight(createdAtIso: string, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - new Date(createdAtIso).getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, ageDays / config.mastery.recencyHalfLifeDays);
}

function difficultyWeight(difficultyScore: number): number {
  const t = Math.min(1, Math.max(0, (difficultyScore - 1) / 9)); // difficultyScore is 1-10
  return config.mastery.difficultyWeightMin + t * (config.mastery.difficultyWeightMax - config.mastery.difficultyWeightMin);
}

function independenceWeight(assistanceUsed: 'NONE' | 'HINT' | 'SOLUTION_VIEWED'): number {
  return config.mastery.independenceMultiplier[assistanceUsed] ?? config.mastery.independenceMultiplier.HINT;
}

/** True if the most recent evidence shows the same mistakeCategory recurring at/above threshold frequency. */
export function detectRepeatedMistake(evidence: Evidence[]): { repeated: boolean; category: string | null } {
  const recent = evidence.slice(-config.mastery.repeatedMistakeWindow);
  if (recent.length < 2) return { repeated: false, category: null };
  const failing = recent.filter((e) => e.mistakeCategory && e.mistakeCategory !== 'NONE' && !e.languageIssue);
  if (failing.length === 0) return { repeated: false, category: null };
  const counts = new Map<string, number>();
  for (const e of failing) counts.set(e.mistakeCategory as string, (counts.get(e.mistakeCategory as string) ?? 0) + 1);
  const [topCategory, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const fraction = topCount / recent.length;
  return { repeated: fraction >= config.mastery.repeatedMistakeThresholdFraction, category: fraction >= config.mastery.repeatedMistakeThresholdFraction ? topCategory : null };
}

export function computeMastery(
  evidenceIn: Evidence[],
  opts: { prerequisiteReadinessScore: number | null; now?: Date } = { prerequisiteReadinessScore: null },
): MasteryComputation {
  const evidence = filterAlgorithmicEvidence(evidenceIn);
  const nowMs = (opts.now ?? new Date()).getTime();

  if (evidence.length === 0) {
    return { masteryScore: 0, weightedAverage: 0, repeatedMistakePenaltyApplied: false, prerequisiteCapApplied: false, evidenceCount: 0, independentSuccessCount: 0, distinctChallengesCount: 0 };
  }

  let numerator = 0;
  let denominator = 0;
  for (const e of evidence) {
    const w = difficultyWeight(e.difficultyScore) * independenceWeight(e.assistanceUsed) * recencyWeight(e.createdAt, nowMs);
    numerator += e.rawScore * w;
    denominator += w;
  }
  const weightedAverage = denominator > 0 ? numerator / denominator : 0;

  const { repeated } = detectRepeatedMistake(evidence);
  const afterPenalty = repeated ? weightedAverage * config.mastery.repeatedMistakePenalty : weightedAverage;

  let prerequisiteCapApplied = false;
  let capped = afterPenalty;
  if (opts.prerequisiteReadinessScore !== null && opts.prerequisiteReadinessScore < config.mastery.prerequisiteReadinessScoreThreshold) {
    const capAsFraction = config.mastery.prerequisiteCapScore / 100;
    if (afterPenalty > capAsFraction) {
      capped = capAsFraction;
      prerequisiteCapApplied = true;
    }
  }

  const independentSuccessCount = evidence.filter((e) => e.independent && e.rawScore >= 0.999).length;
  const distinctChallengesCount = new Set(evidence.map((e) => e.challengeId)).size;

  return {
    masteryScore: Math.round(capped * 1000) / 10, // 0-100, 1 decimal
    weightedAverage,
    repeatedMistakePenaltyApplied: repeated,
    prerequisiteCapApplied,
    evidenceCount: evidence.length,
    independentSuccessCount,
    distinctChallengesCount,
  };
}

// =============================================================================
// CONFIDENCE ESTIMATION (Phase 7)
// Confidence reflects how much TRUSTWORTHY evidence exists — independent of
// how good the mastery score looks. One lucky pass = low confidence even if
// the raw score looks "strong".
// =============================================================================

export interface ConfidenceComputation {
  confidenceScore: number; // 0-100
  volumeComponent: number;
  diversityComponent: number;
  independenceComponent: number;
  contradictionPenaltyApplied: boolean;
}

export function computeConfidence(evidenceIn: Evidence[], contradictionFlag: boolean): ConfidenceComputation {
  const evidence = filterAlgorithmicEvidence(evidenceIn);
  if (evidence.length === 0) {
    return { confidenceScore: 0, volumeComponent: 0, diversityComponent: 0, independenceComponent: 0, contradictionPenaltyApplied: false };
  }
  const volumeComponent = Math.min(1, evidence.length / config.confidence.targetEvidenceCount);

  const distinctChallenges = new Set(evidence.map((e) => e.challengeId)).size;
  const distinctDifficultyBuckets = new Set(evidence.map((e) => Math.round(e.difficultyScore))).size;
  const diversityComponent = Math.min(1, distinctChallenges / config.confidence.targetDistinctChallenges) * 0.75
    + Math.min(1, distinctDifficultyBuckets / 3) * 0.25;

  const successCount = evidence.filter((e) => e.rawScore >= 0.999).length;
  const independentSuccessCount = evidence.filter((e) => e.independent && e.rawScore >= 0.999).length;
  const independenceComponent = successCount > 0 ? independentSuccessCount / successCount : 0;

  const times = evidence.map((e) => new Date(e.createdAt).getTime());
  const spreadMs = Math.max(...times) - Math.min(...times);
  const recencySpread = Math.min(1, spreadMs / (1000 * 60 * 60 * 24 * 7)); // saturates at 1 week spread

  let raw =
    config.confidence.weights.volume * volumeComponent +
    config.confidence.weights.diversity * diversityComponent +
    config.confidence.weights.independence * independenceComponent +
    config.confidence.weights.recencySpread * recencySpread;

  if (contradictionFlag) raw *= config.confidence.contradictionPenaltyMultiplier;

  return {
    confidenceScore: Math.round(Math.min(1, raw) * 1000) / 10,
    volumeComponent, diversityComponent, independenceComponent,
    contradictionPenaltyApplied: contradictionFlag,
  };
}

// =============================================================================
// TREND DETECTION (Phase 8)
// =============================================================================

export function computeTrend(evidenceIn: Evidence[]): Trend {
  const evidence = filterAlgorithmicEvidence(evidenceIn);
  const recent = evidence.slice(-config.trend.windowSize);
  if (recent.length < config.trend.minPointsRequired) return 'INSUFFICIENT_DATA';

  const ys = recent.map((e) => e.rawScore);
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den === 0 ? 0 : num / den;

  const variance = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0) / n;

  if (variance >= config.trend.inconsistentVarianceThreshold && Math.abs(slope) < config.trend.slopeImprovingThreshold) {
    return 'INCONSISTENT';
  }
  if (slope >= config.trend.slopeImprovingThreshold) return 'IMPROVING';
  if (slope <= config.trend.slopeDecliningThreshold) return 'DECLINING';
  return 'STABLE';
}

// =============================================================================
// CONTRADICTORY EVIDENCE DETECTION (Phase 10)
// =============================================================================

export interface ContradictionResult {
  contradictory: boolean;
  explanation: string | null;
}

export function detectContradiction(evidenceIn: Evidence[]): ContradictionResult {
  const evidence = filterAlgorithmicEvidence(evidenceIn);
  const recent = evidence.slice(-config.contradiction.lookbackCount);
  if (recent.length < 3) return { contradictory: false, explanation: null };

  // Look for: an EASIER attempt failed while a HARDER attempt (later or
  // similarly recent) succeeded, without an assistance/context explanation.
  for (let i = 0; i < recent.length; i++) {
    for (let j = 0; j < recent.length; j++) {
      if (i === j) continue;
      const easier = recent[i];
      const harder = recent[j];
      const gap = harder.difficultyScore - easier.difficultyScore;
      const easierFailed = easier.rawScore < 0.5;
      const harderSucceeded = harder.rawScore >= 0.999;
      const sameIndependence = easier.independent === harder.independent;
      const sameContext = easier.contextType === harder.contextType;
      if (gap >= config.contradiction.minDifficultyGapForContradiction && easierFailed && harderSucceeded && sameIndependence && sameContext) {
        return {
          contradictory: true,
          explanation: `Failed an easier attempt (difficulty ${easier.difficultyScore}) but passed a harder one (difficulty ${harder.difficultyScore}) under comparable conditions (independent=${easier.independent}, context=${easier.contextType}) — inconsistent with a simple monotonic skill level.`,
        };
      }
    }
  }
  return { contradictory: false, explanation: null };
}
