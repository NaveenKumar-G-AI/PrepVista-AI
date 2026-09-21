import { z } from 'zod';
import { STAGE_ORDER } from './types';

export const createOutcomeSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required.').max(200),
  roleTitle: z.string().trim().min(1, 'Role title is required.').max(200),
  roleCategory: z.string().trim().min(1, 'Role category is required.').max(120),
  source: z.string().trim().max(120).nullable().optional(),
  targetAlignment: z.enum(['aligned', 'partial', 'misaligned', 'unknown']).default('unknown'),
  furthestStageKey: z.enum(STAGE_ORDER as [string, ...string[]]),
  furthestStageStatus: z.enum(['passed', 'rejected', 'withdrawn', 'offer_received', 'pending']),
  customStageLabel: z.string().trim().max(80).nullable().optional(),
  recruiterFeedbackText: z.string().trim().max(4000).nullable().optional(),
  studentReflectionText: z.string().trim().max(4000).nullable().optional(),
});

export const addFeedbackSchema = z.object({
  recruiterFeedbackText: z.string().trim().max(4000).nullable().optional(),
  studentReflectionText: z.string().trim().max(4000).nullable().optional(),
});

export const createRecoverySchema = z.object({
  opportunityId: z.string().min(1),
});

export const completeActionSchema = z.object({
  actionId: z.string().min(1),
});

export const reassessSchema = z.object({
  result: z.enum(['improved', 'no_change', 'declined', 'unclear']),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  return first ? first.message : 'The request was invalid.';
}
