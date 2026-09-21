import { z } from "zod";
import type { GrowthEvidence } from "../types.ts";
import {
  ASSISTANCE_LEVELS,
  DIFFICULTY_LEVELS,
  EVIDENCE_SOURCE_TYPES,
} from "../types.ts";

export const NORMALIZER_VERSION = "evidence-normalizer@1.0.0";

/**
 * The generic shape every source-specific adapter (see adapters.ts) maps
 * its own analysis-system output INTO, before this module turns it into an
 * immutable GrowthEvidence row. Keeping this step in the middle means a
 * change to one upstream system's schema only touches its one adapter, not
 * every consumer of growth_evidence.
 */
export const RawSourceEventSchema = z.object({
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  sourceId: z.string().min(1),
  studentId: z.string().min(1),
  dimension: z.string().min(1),
  outcome: z.enum(["SUCCESS", "PARTIAL", "FAILURE"]),
  sourceConfidence: z.number().min(0).max(1),
  assistanceLevel: z.enum(ASSISTANCE_LEVELS),
  difficulty: z.enum(DIFFICULTY_LEVELS).nullable(),
  isTransfer: z.boolean(),
  isRetentionCheck: z.boolean(),
  challengeFamily: z.string().nullable(),
  roleContext: z.string().nullable(),
  occurredAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  context: z.record(z.unknown()).default({}),
});

export type RawSourceEvent = z.infer<typeof RawSourceEventSchema>;

export interface NormalizeDeps {
  now?: () => Date;
  generateId?: () => string;
}

/**
 * source validation -> semantic normalization -> skill mapping ->
 * confidence normalization -> temporal indexing -> growth evidence
 *
 * Each step is a named, testable stage rather than one opaque function, per
 * spec's evidence-normalization pipeline. `skill mapping` here is a no-op
 * pass-through because dimension mapping already happened in the
 * source-specific adapter (adapters.ts) — that's a deliberate choice: the
 * adapter is the only place that needs to know "this analysis system's
 * output corresponds to THIS dimension", so that knowledge doesn't leak
 * into the generic pipeline.
 */
export function normalizeEvidence(raw: unknown, deps: NormalizeDeps = {}): GrowthEvidence {
  const now = deps.now?.() ?? new Date();
  const genId = deps.generateId ?? (() => cryptoRandomId());

  // 1. source validation
  const validated = RawSourceEventSchema.parse(raw);

  // 2. semantic normalization (outcome/assistance/difficulty are already
  //    enum-constrained by the schema above; nothing further required, but
  //    this is the seam where e.g. legacy outcome strings would get mapped)

  // 3. skill mapping — pass-through, see doc comment above

  // 4. confidence normalization — clamp defensively even though the schema
  //    already enforces 0-1, in case an upstream system's confidence scale
  //    changes without updating its adapter
  const sourceConfidence = Math.max(0, Math.min(1, validated.sourceConfidence));

  // 5. temporal indexing
  const occurredAt = new Date(validated.occurredAt).toISOString();

  // 6. growth evidence
  const evidence: GrowthEvidence = {
    evidenceId: genId(),
    studentId: validated.studentId,
    dimension: validated.dimension as GrowthEvidence["dimension"],
    sourceType: validated.sourceType,
    sourceId: validated.sourceId,
    outcome: validated.outcome,
    sourceConfidence,
    assistanceLevel: validated.assistanceLevel,
    difficulty: validated.difficulty,
    isTransfer: validated.isTransfer,
    isRetentionCheck: validated.isRetentionCheck,
    challengeFamily: validated.challengeFamily,
    roleContext: validated.roleContext,
    occurredAt,
    recordedAt: now.toISOString(),
    evidenceVersion: NORMALIZER_VERSION,
    context: validated.context,
  };

  return evidence;
}

function cryptoRandomId(): string {
  // Node 19+ / modern browsers both have this global.
  return globalThis.crypto?.randomUUID?.() ?? `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
