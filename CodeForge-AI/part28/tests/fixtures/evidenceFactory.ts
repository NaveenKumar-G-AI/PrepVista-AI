import type { AssistanceLevel, DifficultyLevel, EvidenceOutcome, GrowthDimension, GrowthEvidence } from "../../src/lib/growth/types.ts";

let counter = 0;

export function ev(overrides: Partial<GrowthEvidence> & { dimension: GrowthDimension; occurredAt: string }): GrowthEvidence {
  counter += 1;
  return {
    evidenceId: `fixture_${counter}`,
    studentId: "student_1",
    sourceType: "correctness",
    sourceId: `source_${counter}`,
    outcome: "SUCCESS",
    sourceConfidence: 0.9,
    assistanceLevel: "NONE",
    difficulty: "MEDIUM",
    isTransfer: false,
    isRetentionCheck: false,
    challengeFamily: `family_${counter}`,
    roleContext: null,
    recordedAt: overrides.occurredAt,
    evidenceVersion: "test-fixture@1",
    context: {},
    ...overrides,
  };
}

/** `daysAgoIso(10)` => an ISO timestamp 10 days before `now`. */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86400000).toISOString();
}

export function outcome(o: EvidenceOutcome): EvidenceOutcome {
  return o;
}
export function assistance(a: AssistanceLevel): AssistanceLevel {
  return a;
}
export function difficulty(d: DifficultyLevel): DifficultyLevel {
  return d;
}
