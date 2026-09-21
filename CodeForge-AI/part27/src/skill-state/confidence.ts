import type { SkillEvidence } from '../types/evidence.js';
import type { ConfidenceResult, ConfidenceLevel } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';
import { recencyDecay } from './util.js';

/**
 * Confidence Model (section 13). Confidence answers a different question
 * than the state score does: not "is the student good at this?" but "how
 * much should anyone trust that conclusion?". It is driven purely by
 * evidence volume and diversity, decayed by recency — never by the
 * direction of the outcome. A HIGH-confidence weakness is just as valid a
 * conclusion as a HIGH-confidence strength.
 */
export function computeConfidence(evidence: SkillEvidence[], nowIso: string = new Date().toISOString()): ConfidenceResult {
  if (evidence.length === 0) {
    return { level: 'LOW', score: 0, evidenceCount: 0, distinctSources: 0 };
  }

  let effectiveCount = 0;
  const sources = new Set<string>();
  for (const e of evidence) {
    effectiveCount += e.confidence * recencyDecay(e.timestamp, nowIso, growthRules.confidence.recencyHalfLifeDays);
    sources.add(e.source);
  }

  const { minEvidenceForModerate, minEvidenceForHigh, minDistinctSourcesForHigh } = growthRules.confidence;

  const volumeScore = Math.min(1, effectiveCount / minEvidenceForHigh);
  const diversityScore = Math.min(1, sources.size / minDistinctSourcesForHigh);
  const score = Math.max(0, Math.min(1, 0.7 * volumeScore + 0.3 * diversityScore));

  let level: ConfidenceLevel = 'LOW';
  if (effectiveCount >= minEvidenceForHigh && sources.size >= minDistinctSourcesForHigh) {
    level = 'HIGH';
  } else if (effectiveCount >= minEvidenceForModerate) {
    level = 'MODERATE';
  }

  return { level, score, evidenceCount: evidence.length, distinctSources: sources.size };
}
