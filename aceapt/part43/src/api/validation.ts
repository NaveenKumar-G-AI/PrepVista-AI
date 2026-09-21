import { z } from 'zod';

export const startDiagnosticSchema = z.object({
  tenantId: z.string().optional(),
  objective: z
    .enum(['general_baseline', 'placement_preparation', 'company_preparation', 'weakness_investigation', 'reassessment'])
    .optional(),
  companyId: z.string().optional(),
  requiredDomains: z.array(z.string()).min(1),
  minQuestionsPerDomain: z.number().int().min(0).optional(),
  maxQuestions: z.number().int().min(1).optional(),
  minQuestions: z.number().int().min(1).optional(),
  targetEvidenceConfidence: z.enum(['low', 'moderate', 'high']).optional(),
  reassessmentBaselineSessionId: z.string().optional(),
});

export const submitResponseSchema = z.object({
  questionId: z.string().min(1),
  isCorrect: z.boolean(),
  responseTimeMs: z.number().int().min(0),
  confidence: z.object({ level: z.enum(['low', 'medium', 'high']) }).optional(),
  submittedAnswer: z.unknown().optional(),
  clientRequestId: z.string().optional(),
});
