import type { SkillStateLabel } from '../types/skill-state.js';
import type { ConfidenceLevel } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Section 63: "Define transition rules centrally." This file is that
 * center. Two responsibilities live here:
 *
 *  1. deriveBaseState — maps an aggregate score onto the positive
 *     progression ladder (UNKNOWN..MASTERED). MASTERED is deliberately
 *     gated behind evidence volume + confidence, not score alone — this is
 *     the literal implementation of the spec's own worked example
 *     (section 13): one perfect, isolated demonstration produces a high
 *     score but lands on PROFICIENT/LOW-confidence, not MASTERED.
 *
 *  2. validateTransition — a central adjacency graph that rejects
 *     transitions with no defensible path (MASTERED collapsing straight to
 *     INTRODUCED in one step), independent of whatever produced the
 *     candidate. This is a backstop, not the primary defense — the
 *     primary defense is that aggregateEvidence() is a weighted average
 *     over full history, so one bad data point rarely produces an extreme
 *     candidate in the first place. Both layers are tested separately in
 *     src/__tests__/state-machine.test.ts.
 */

const LADDER: SkillStateLabel[] = ['UNKNOWN', 'INTRODUCED', 'DEVELOPING', 'PRACTICED', 'PROFICIENT', 'MASTERED'];

export function deriveBaseState(score: number | null, evidenceCount: number, confidenceLevel: ConfidenceLevel): SkillStateLabel {
  if (evidenceCount === 0 || score === null) return 'UNKNOWN';

  const { developingThreshold, practicedThreshold, proficientThreshold, masteryThreshold, minEvidenceForMastery, minConfidenceLevelForMastery } = growthRules;

  if (score < developingThreshold) return 'INTRODUCED';
  if (score < practicedThreshold) return 'DEVELOPING';
  if (score < proficientThreshold) return 'PRACTICED';
  if (score < masteryThreshold) return 'PROFICIENT';

  const confidenceRank: Record<ConfidenceLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };
  const meetsConfidenceBar = confidenceRank[confidenceLevel] >= confidenceRank[minConfidenceLevelForMastery as ConfidenceLevel];

  if (evidenceCount >= minEvidenceForMastery && meetsConfidenceBar) return 'MASTERED';
  return 'PROFICIENT'; // strong score, not yet enough independent corroboration — section 13
}

// Explicit allow-list of direct (prev -> next) transitions. Anything not
// listed here — most importantly MASTERED -> INTRODUCED/DEVELOPING and
// UNKNOWN -> anything but INTRODUCED — is rejected outright, per section
// 63's literal examples. AT_RISK/REGRESSING are reachable from any
// established rung (a skill can decline from wherever it currently sits,
// not only from PRACTICED+), but never directly from UNKNOWN — you can't
// be "at risk" of losing a skill you have zero evidence for yet.
const ALLOWED_TRANSITIONS: Record<SkillStateLabel, SkillStateLabel[]> = {
  UNKNOWN: ['UNKNOWN', 'INTRODUCED'],
  INTRODUCED: ['INTRODUCED', 'DEVELOPING', 'AT_RISK', 'REGRESSING', 'UNCERTAIN'],
  DEVELOPING: ['DEVELOPING', 'INTRODUCED', 'PRACTICED', 'AT_RISK', 'REGRESSING', 'UNCERTAIN'],
  PRACTICED: ['PRACTICED', 'DEVELOPING', 'PROFICIENT', 'AT_RISK', 'REGRESSING', 'UNCERTAIN'],
  PROFICIENT: ['PROFICIENT', 'PRACTICED', 'MASTERED', 'AT_RISK', 'REGRESSING', 'UNCERTAIN'],
  MASTERED: ['MASTERED', 'PROFICIENT', 'AT_RISK', 'REGRESSING', 'UNCERTAIN'],
  AT_RISK: ['AT_RISK', 'RECOVERING', 'REGRESSING', 'INTRODUCED', 'DEVELOPING', 'PRACTICED', 'PROFICIENT', 'UNCERTAIN'],
  REGRESSING: ['REGRESSING', 'AT_RISK', 'RECOVERING', 'UNCERTAIN'],
  RECOVERING: ['RECOVERING', 'INTRODUCED', 'DEVELOPING', 'PRACTICED', 'PROFICIENT', 'REGRESSING', 'AT_RISK', 'UNCERTAIN'],
  UNCERTAIN: ['UNCERTAIN', 'INTRODUCED', 'DEVELOPING', 'PRACTICED', 'PROFICIENT', 'AT_RISK', 'REGRESSING'],
};

// Where to land instead, when a transition is rejected — always the
// nearest state that acknowledges "something changed" without asserting a
// conclusion the evidence doesn't support yet.
function nearestSafeLanding(prev: SkillStateLabel): SkillStateLabel {
  if (prev === 'MASTERED' || prev === 'PROFICIENT') return 'REGRESSING';
  if (prev === 'UNKNOWN') return 'INTRODUCED';
  return 'UNCERTAIN';
}

export interface TransitionValidationResult {
  allowed: boolean;
  resolvedState: SkillStateLabel;
  reason?: string;
}

export function validateTransition(prev: SkillStateLabel, candidate: SkillStateLabel): TransitionValidationResult {
  if (prev === candidate) return { allowed: true, resolvedState: candidate };

  const allowedNext = ALLOWED_TRANSITIONS[prev] ?? [prev];
  if (allowedNext.includes(candidate)) {
    return { allowed: true, resolvedState: candidate };
  }

  const resolvedState = nearestSafeLanding(prev);
  return {
    allowed: false,
    resolvedState,
    reason: `No direct evidence-supported path from ${prev} to ${candidate} in one update; landed on ${resolvedState} pending more evidence.`,
  };
}

export function ladderIndex(state: SkillStateLabel): number {
  return LADDER.indexOf(state);
}
