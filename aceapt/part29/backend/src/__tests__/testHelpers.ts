import {
  CAPABILITY_LEVEL_SCORE,
  CapabilityDna,
  CapabilityDnaEntry,
  CapabilityLevel,
  ConfidenceBand,
} from '../domain/types';
import { capabilityName } from '../config/capabilities';

export function makeEntry(
  capabilityId: string,
  level: CapabilityLevel,
  opts: { confidence?: ConfidenceBand; verified?: boolean; eventCount?: number } = {},
): CapabilityDnaEntry {
  const confidenceBand = opts.confidence ?? 'HIGH';
  const eventCount = opts.eventCount ?? 5;
  return {
    capabilityId,
    capabilityName: capabilityName(capabilityId),
    level,
    levelScore: CAPABILITY_LEVEL_SCORE[level],
    confidence: {
      band: confidenceBand,
      score: confidenceBand === 'HIGH' ? 0.85 : confidenceBand === 'MEDIUM' ? 0.5 : 0.15,
      attemptCount: eventCount,
      proofVerifiedCount: opts.verified ? eventCount : 0,
      mostRecentAt: new Date().toISOString(),
      reasons: [],
    },
    hasVerifiedEvidence: opts.verified ?? false,
    evidenceEventCount: eventCount,
  };
}

export function makeDna(studentId: string, entries: CapabilityDnaEntry[]): CapabilityDna {
  return { studentId, generatedAt: new Date().toISOString(), entries };
}
