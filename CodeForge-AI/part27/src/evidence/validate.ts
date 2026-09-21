import { z } from 'zod';
import type { RawEvidenceInput } from '../types/evidence.js';

/**
 * Structural validation for evidence arriving from upstream systems
 * (section 7: Raw Evidence -> Validation -> Normalization). This is the
 * first line of defense against malformed source records (section 62) —
 * nothing past this point ever sees an evidence object with a missing
 * skill id, an impossible timestamp, or an out-of-range strength value.
 */

const evidenceSourceSchema = z.enum([
  'correctness',
  'complexity',
  'code_quality',
  'reasoning',
  'consistency',
  'understanding',
  'debugging',
  'adaptive_learning',
  'review',
]);

const evidenceQualitySchema = z.enum([
  'DIRECT',
  'INDIRECT',
  'DETERMINISTIC',
  'INFERRED',
  'SELF_REPORTED',
  'AI_ASSISTED',
]);

const evidenceOutcomeSchema = z.enum(['positive', 'negative', 'neutral']);

const transferContextSchema = z
  .object({
    isTransferAttempt: z.boolean(),
    baseContext: z.string().max(200).optional(),
    novelContext: z.string().max(200).optional(),
  })
  .strict();

export const rawEvidenceInputSchema = z
  .object({
    studentId: z.string().min(1),
    source: evidenceSourceSchema,
    sourceRecordId: z.string().min(1),
    skillId: z.string().min(1),
    evidenceType: evidenceQualitySchema,
    outcome: evidenceOutcomeSchema,
    strength: z.number().min(0).max(1),
    timestamp: z.string().datetime({ offset: true }).or(z.string().datetime()),
    challengeContext: z.record(z.unknown()).optional(),
    roleContext: z.string().max(100).optional(),
    transferContext: transferContextSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
  data: RawEvidenceInput | null;
}

export function validateRawEvidence(input: unknown, nowIso: string = new Date().toISOString()): EvidenceValidationResult {
  const parsed = rawEvidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      data: null,
    };
  }

  const errors: string[] = [];

  // Section 62 / 90: reject impossible (future) timestamps rather than
  // silently accepting them — a future timestamp usually means clock skew
  // or a manipulated client payload, either way it should not enter the
  // evidence ledger un-flagged.
  if (new Date(parsed.data.timestamp).getTime() > new Date(nowIso).getTime() + 60_000) {
    errors.push('timestamp is in the future');
  }

  if (parsed.data.transferContext?.isTransferAttempt && !parsed.data.transferContext.novelContext) {
    errors.push('transferContext.isTransferAttempt is true but novelContext is missing');
  }

  return { valid: errors.length === 0, errors, data: errors.length === 0 ? parsed.data : null };
}
