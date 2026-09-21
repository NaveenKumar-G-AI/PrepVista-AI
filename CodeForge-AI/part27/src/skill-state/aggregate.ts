import type { SkillEvidence, EvidenceOutcome } from '../types/evidence.js';
import { growthRules } from '../config/growth-rules.js';
import { recencyDecay } from './util.js';

export interface AggregateResult {
  /** 0..1, 0.5 = neutral. null when there is no evidence to aggregate. */
  score: number | null;
  totalWeight: number;
  evidenceCount: number;
  positiveCount: number;
  negativeCount: number;
}

const OUTCOME_VALUE: Record<EvidenceOutcome, number> = { positive: 1, neutral: 0, negative: -1 };

/**
 * Evidence Aggregation (section 6/12). Every piece of evidence is weighted
 * by (a) how much the evidence type deserves to be trusted, (b) how strong
 * that individual demonstration was, and (c) how recent it is. Because the
 * score is a weighted average over the *entire* evidence history rather
 * than a delta from the last event, one new data point mathematically
 * cannot swing an established score by much — this is the primary
 * mechanism behind "do not overreact" (section 12), not a special case
 * bolted on afterward.
 */
export function aggregateEvidence(evidence: SkillEvidence[], nowIso: string = new Date().toISOString()): AggregateResult {
  if (evidence.length === 0) {
    return { score: null, totalWeight: 0, evidenceCount: 0, positiveCount: 0, negativeCount: 0 };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const e of evidence) {
    const decay = recencyDecay(e.timestamp, nowIso, growthRules.confidence.recencyHalfLifeDays);
    const weight = e.confidence * e.strength * decay;
    weightedSum += OUTCOME_VALUE[e.outcome] * weight;
    totalWeight += weight;
    if (e.outcome === 'positive') positiveCount += 1;
    if (e.outcome === 'negative') negativeCount += 1;
  }

  if (totalWeight === 0) {
    return { score: null, totalWeight: 0, evidenceCount: evidence.length, positiveCount, negativeCount };
  }

  const normalized = (weightedSum / totalWeight + 1) / 2; // [-1, 1] -> [0, 1]
  return {
    score: Math.max(0, Math.min(1, normalized)),
    totalWeight,
    evidenceCount: evidence.length,
    positiveCount,
    negativeCount,
  };
}

/** Splits evidence into a recent window and everything before it, for trajectory/regression comparisons. */
export function splitByWindow(evidence: SkillEvidence[], nowIso: string, windowDays: number): { inWindow: SkillEvidence[]; beforeWindow: SkillEvidence[] } {
  const cutoff = new Date(nowIso).getTime() - windowDays * 86_400_000;
  const inWindow: SkillEvidence[] = [];
  const beforeWindow: SkillEvidence[] = [];
  for (const e of evidence) {
    if (new Date(e.timestamp).getTime() >= cutoff) inWindow.push(e);
    else beforeWindow.push(e);
  }
  return { inWindow, beforeWindow };
}
