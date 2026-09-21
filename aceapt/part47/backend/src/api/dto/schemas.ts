import { z } from 'zod';
import { ALLOWED_STUDENT_FEEDBACK } from '../../services/views.js';

export const startSessionSchema = z.object({
  problemId: z.string().min(1),
});

export const submitStepSchema = z.object({
  rawInput: z.string().max(2000),
  expectedVersion: z.number().int().min(0).optional(),
  clientRequestId: z.string().max(200).optional(),
});

export const requestGuidanceSchema = z.object({
  studentNote: z.string().max(1000).optional(),
});

export const reconstructionSchema = z.object({
  answers: z.record(z.string(), z.string().max(500)),
});

export const feedbackSchema = z.object({
  feedback: z.enum(ALLOWED_STUDENT_FEEDBACK),
});

export const devTokenSchema = z.object({
  studentId: z.string().min(1).max(200),
});
