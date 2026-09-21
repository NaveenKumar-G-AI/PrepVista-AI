/**
 * Sections 6-15: turns SkillEvidence into named, explainable gap flags.
 *
 * Hard rule for this whole file: a flag is only ever raised when there is
 * ENOUGH data to support it. Missing data produces "we don't know yet",
 * never a manufactured gap and never a manufactured pass — see section 15
 * ("This is better than inventing a mastery conclusion") and the QA
 * requirement in section 52 that the system must never fabricate a verdict
 * from thin evidence.
 */

import { THRESHOLDS } from '../domain/constants';
import { DIFFICULTY_ORDER, DifficultyLevel, GapFlag, SkillEvidence } from '../domain/types';

export interface AnalysisResult {
  sufficiency: 'SUFFICIENT' | 'INSUFFICIENT';
  difficultyCeiling: DifficultyLevel | null;
  stability: 'STABLE' | 'UNSTABLE' | 'INSUFFICIENT';
  flags: GapFlag[];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeDifficultyCeiling(evidence: SkillEvidence): { ceiling: DifficultyLevel | null; gap: boolean } {
  let ceiling: DifficultyLevel | null = null;
  for (const d of DIFFICULTY_ORDER) {
    const bucket = evidence.byDifficulty[d];
    const meetsBar = bucket.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_DIFFICULTY && (bucket.accuracy ?? 0) >= THRESHOLDS.INDEPENDENT_MASTERY_ACCURACY;
    if (meetsBar) {
      ceiling = d;
    } else {
      break; // don't let a strong "hard" bucket paper over a weak/unproven "medium" bucket
    }
  }

  const easy = evidence.byDifficulty.easy;
  const hard = evidence.byDifficulty.hard;
  const gap =
    easy.accuracy != null &&
    hard.accuracy != null &&
    hard.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_DIFFICULTY &&
    easy.accuracy - hard.accuracy >= THRESHOLDS.DIFFICULTY_GAP_PP;

  return { ceiling, gap };
}

function computeFormatGap(evidence: SkillEvidence): boolean {
  const usable = Object.values(evidence.byFormat).filter((b) => b.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_FORMAT && b.accuracy != null);
  if (usable.length < 2) return false;
  const accuracies = usable.map((b) => b.accuracy as number);
  return Math.max(...accuracies) - Math.min(...accuracies) >= THRESHOLDS.FORMAT_GAP_PP;
}

function computeContextGap(evidence: SkillEvidence): boolean {
  const usable = Object.values(evidence.byContext).filter((b) => b.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_CONTEXT && b.accuracy != null);
  if (usable.length < 2) return false;
  const accuracies = usable.map((b) => b.accuracy as number);
  return Math.max(...accuracies) - Math.min(...accuracies) >= THRESHOLDS.CONTEXT_GAP_PP;
}

export function analyzeEvidence(evidence: SkillEvidence): AnalysisResult {
  const flags: GapFlag[] = [];

  const sufficiency: AnalysisResult['sufficiency'] =
    evidence.totalAttempts >= THRESHOLDS.MIN_ATTEMPTS_FOR_ANY_EVIDENCE ? 'SUFFICIENT' : 'INSUFFICIENT';
  if (sufficiency === 'INSUFFICIENT') flags.push('INSUFFICIENT_EVIDENCE');

  // Section 5 — independence gap
  if (
    evidence.guidedAccuracy != null &&
    evidence.independentAccuracy != null &&
    evidence.guidedAccuracy - evidence.independentAccuracy >= THRESHOLDS.INDEPENDENCE_GAP_PP
  ) {
    flags.push('INDEPENDENCE_GAP');
  }

  // Section 6 — difficulty robustness
  const { ceiling, gap: difficultyGap } = computeDifficultyCeiling(evidence);
  if (difficultyGap) flags.push('DIFFICULTY_GAP');

  // Section 7 — format robustness
  if (computeFormatGap(evidence)) flags.push('FORMAT_TRANSFER_GAP');

  // Section 8 — context transfer
  if (computeContextGap(evidence)) flags.push('CONTEXT_TRANSFER_GAP');

  // Section 10 — familiar vs novel transfer
  if (
    evidence.familiarAccuracy != null &&
    evidence.novelAccuracy != null &&
    evidence.novelIndependentAttempts >= THRESHOLDS.MIN_NOVEL_INDEPENDENT_ATTEMPTS &&
    evidence.familiarAccuracy - evidence.novelAccuracy >= THRESHOLDS.TRANSFER_GAP_PP
  ) {
    flags.push('TRANSFER_GAP');
  }

  // Section 11 — retention
  if (
    evidence.retention.delayedAttempts >= THRESHOLDS.MIN_DELAYED_ATTEMPTS &&
    evidence.retention.immediateAccuracy != null &&
    evidence.retention.delayedAccuracy != null &&
    evidence.retention.immediateAccuracy - evidence.retention.delayedAccuracy >= THRESHOLDS.RETENTION_GAP_PP
  ) {
    flags.push('RETENTION_GAP');
  }

  // Section 13 — stability
  let stability: AnalysisResult['stability'] = 'INSUFFICIENT';
  if (evidence.rollingAccuracies.length >= THRESHOLDS.STABILITY_MIN_WINDOWS) {
    const sd = stddev(evidence.rollingAccuracies);
    const floorOk = Math.min(...evidence.rollingAccuracies) >= THRESHOLDS.STABILITY_FLOOR;
    stability = sd <= THRESHOLDS.STABILITY_STDDEV_MAX && floorOk ? 'STABLE' : 'UNSTABLE';
    if (stability === 'UNSTABLE') flags.push('STABILITY_GAP');
  }

  return { sufficiency, difficultyCeiling: ceiling, stability, flags };
}
