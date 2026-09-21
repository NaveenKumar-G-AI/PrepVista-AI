import { capabilityName } from '../config/capabilities';
import {
  CapabilityDna,
  CapabilityDnaEntry,
  CapabilityEvidenceEvent,
  levelFromScore,
} from '../domain/types';
import { calculateEvidenceConfidence } from './confidence';

/**
 * Builds Capability DNA from raw evidence events (spec §10-12).
 *
 * This is the ONLY place a capability level is computed from raw
 * performance numbers. Every other engine module reads levels back out of
 * a CapabilityDna it was handed — none of them touch raw evidence directly.
 * That keeps "what does STRONG mean" answerable in one function.
 */

function daysSince(iso: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

const HALF_LIFE_DAYS = 60;

function recencyWeight(days: number): number {
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * A single event's contribution to the level estimate weights recency
 * (recent performance reflects current ability better than a stale attempt)
 * and difficulty (correctly handling a harder item is stronger evidence of
 * ability than the same result on an easy one). Both factors are explicit
 * and bounded so the formula stays auditable.
 */
function eventWeight(event: CapabilityEvidenceEvent, now: Date): number {
  const recency = recencyWeight(daysSince(event.occurredAt, now));
  const difficultyBoost = 0.6 + 0.4 * event.difficulty; // 0.6..1.0
  return recency * difficultyBoost;
}

export function buildCapabilityDnaEntry(
  capabilityId: string,
  events: CapabilityEvidenceEvent[],
  now: Date = new Date(),
): CapabilityDnaEntry | null {
  if (events.length === 0) return null;

  const weights = events.map((e) => eventWeight(e, now));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const levelScore =
    totalWeight > 0
      ? events.reduce((sum, e, i) => sum + e.performance * (weights[i] ?? 0), 0) / totalWeight
      : 0;

  const confidence = calculateEvidenceConfidence(events, now);

  return {
    capabilityId,
    capabilityName: capabilityName(capabilityId),
    level: levelFromScore(levelScore),
    levelScore: Math.max(0, Math.min(1, levelScore)),
    confidence,
    hasVerifiedEvidence: events.some((e) => e.proofVerified),
    evidenceEventCount: events.length,
  };
}

export function buildCapabilityDna(
  studentId: string,
  evidenceByCapability: Record<string, CapabilityEvidenceEvent[]>,
  now: Date = new Date(),
): CapabilityDna {
  const entries: CapabilityDnaEntry[] = [];
  for (const [capabilityId, events] of Object.entries(evidenceByCapability)) {
    const entry = buildCapabilityDnaEntry(capabilityId, events, now);
    if (entry) entries.push(entry);
  }
  return { studentId, generatedAt: now.toISOString(), entries };
}

export function findEntry(dna: CapabilityDna, capabilityId: string): CapabilityDnaEntry | null {
  return dna.entries.find((e) => e.capabilityId === capabilityId) ?? null;
}
