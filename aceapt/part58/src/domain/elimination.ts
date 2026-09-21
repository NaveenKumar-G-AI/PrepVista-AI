/**
 * Option elimination (§23-25, §93-99). Pure functions — the actual "was this
 * option really eliminable" verification is a port (QuestionEliminationVerifier)
 * because that requires real question metadata this module doesn't own.
 */
import type { EvidenceLevel, EvidenceSignal, EvidenceType } from '../types';

const LEVEL_RANK: Record<EvidenceLevel, number> = {
  VERIFIED: 3,
  OBSERVED: 2,
  SELF_REPORTED: 1,
  INFERRED: 0,
};

/** When several signals are present, the *strongest* level is what the
 *  evidence-quality rating should reflect — but every individual signal keeps
 *  its own level in storage (§103); this is only for summarizing a set. */
export function classifyEliminationEvidence(signals: EvidenceSignal[]): EvidenceLevel {
  if (signals.length === 0) return 'INFERRED';
  return signals.reduce<EvidenceLevel>(
    (best, s) => (LEVEL_RANK[s.level] > LEVEL_RANK[best] ? s.level : best),
    'INFERRED'
  );
}

export const ELIMINATION_EVIDENCE_TYPES: EvidenceType[] = [
  'OPTION_ELIMINATED_UNIT',
  'OPTION_ELIMINATED_MAGNITUDE',
  'OPTION_ELIMINATED_SIGN',
  'OPTION_ELIMINATED_LOGICAL',
  'OPTION_ELIMINATED_FORMULA_CONDITION',
  'OPTION_ELIMINATED_CONTRADICTION',
];

export function isEliminationEvidenceType(type: EvidenceType): boolean {
  return ELIMINATION_EVIDENCE_TYPES.includes(type);
}

/**
 * Fraction of eliminable options actually eliminated (the true answer can
 * never be one of them, hence `totalOptions - 1`). Returns null when there
 * aren't enough options for the concept to make sense.
 */
export function computeOptionReductionRatio(
  totalOptions: number | null | undefined,
  eliminatedCount: number
): number | null {
  if (!totalOptions || totalOptions <= 1) return null;
  return Math.min(1, Math.max(0, eliminatedCount / (totalOptions - 1)));
}

/**
 * §92, §29: whether the remaining option gap looks wide enough that
 * approximation alone could plausibly decide the question. This is a rough,
 * clearly-labeled heuristic for training-content selection — it is never used
 * to tell a student which option is correct.
 */
export function optionsLookSeparated(numericOptions: number[]): boolean {
  if (numericOptions.length < 2) return false;
  const sorted = [...numericOptions].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((v, i) => Math.abs(v - sorted[i]));
  const minGap = Math.min(...gaps);
  const scale = Math.max(...sorted.map(Math.abs), 1);
  return minGap / scale > 0.15; // illustrative threshold, tune with real item data
}
