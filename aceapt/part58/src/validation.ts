/**
 * Request validation (zod). Kept separate from the route handlers so schemas
 * are easy to audit against the DecisionEventInput contract in types.ts.
 */
import { z } from 'zod';

export const decisionActionSchema = z.enum([
  'FULL_SOLVE',
  'PARTIAL_SOLVE',
  'CONTINUE',
  'ELIMINATE',
  'ESTIMATE',
  'INFORMED_GUESS',
  'BLIND_GUESS',
  'SKIP',
  'RETURN_LATER',
  'SWITCH_METHOD',
  'KEEP_ANSWER',
  'CHANGE_ANSWER',
]);

export const uncertaintyStateSchema = z.enum([
  'CERTAIN',
  'HIGH_CONFIDENCE',
  'PROBABLE',
  'UNCERTAIN',
  'LOW_CONFIDENCE',
  'NO_USEFUL_EVIDENCE',
]);

export const confidenceBandSchema = z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);

export const decisionContextSchema = z.enum(['TRAINING', 'PRACTICE', 'MOCK', 'FORMAL_ASSESSMENT']);

export const evidenceSignalSchema = z.object({
  type: z.enum([
    'OPTION_ELIMINATED_UNIT',
    'OPTION_ELIMINATED_MAGNITUDE',
    'OPTION_ELIMINATED_SIGN',
    'OPTION_ELIMINATED_LOGICAL',
    'OPTION_ELIMINATED_FORMULA_CONDITION',
    'OPTION_ELIMINATED_CONTRADICTION',
    'PARTIAL_CALCULATION',
    'FORMULA_INSIGHT',
    'MAGNITUDE_ESTIMATE',
    'PATTERN_RECOGNITION',
    'KNOWN_CONCEPT',
    'ANSWER_CHOICE_STRUCTURE',
    'NEW_EVIDENCE_FOR_SWITCH',
  ]),
  level: z.enum(['OBSERVED', 'VERIFIED', 'SELF_REPORTED', 'INFERRED']),
  optionId: z.string().optional(),
  note: z.string().max(280).optional(),
});

export const submitDecisionSchema = z.object({
  tenantId: z.string().uuid(),
  studentId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  assessmentVersionId: z.string().uuid().nullable().optional(),
  questionVersionId: z.string().uuid(),
  attemptId: z.string().uuid().nullable().optional(),
  context: decisionContextSchema,
  action: decisionActionSchema,
  uncertaintyState: uncertaintyStateSchema.nullable().optional(),
  confidenceBand: confidenceBandSchema.nullable().optional(),
  confidenceProbability: z.number().int().min(0).max(100).nullable().optional(),
  evidenceUsed: z.array(evidenceSignalSchema).default([]),
  eliminatedOptionIds: z.array(z.string()).default([]),
  totalOptions: z.number().int().min(1).max(10).nullable().optional(),
  questionExpectedTimeSeconds: z.number().min(0).nullable().optional(),
  studentExpectedTimeSeconds: z.number().min(0).nullable().optional(),
  elapsedTimeSeconds: z.number().min(0),
  remainingTestTimeSeconds: z.number().min(0).nullable().optional(),
  scoringPolicyVersionId: z.string().uuid().nullable().optional(),
  initialOptionId: z.string().nullable().optional(),
  finalOptionId: z.string().nullable().optional(),
  answerChanged: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(200),
  gradedIsCorrect: z.boolean().nullable().optional(),
});

export const startTrainingSchema = z.object({
  tenantId: z.string().uuid(),
  studentId: z.string().uuid(),
  mode: z.enum(['DECISION', 'ELIMINATION', 'INFORMED_GUESS', 'ESTIMATION', 'RISK', 'TIME', 'SWITCH', 'CONFIDENCE', 'REVIEW']),
  difficultyLevel: z.number().int().min(1).max(10).optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(),
});
