import { z } from 'zod';

/**
 * Ingestion-time validation (section 43: data quality). Rejects corrupted
 * or out-of-range payloads (e.g. a negative duration, a 6-hour "question
 * duration" from a clock glitch) before they can ever reach a signal
 * detector and produce a misleading conclusion.
 */
export const behaviorEventTypeSchema = z.enum([
  'SESSION_STARTED', 'SESSION_COMPLETED', 'SESSION_ABANDONED',
  'QUESTION_STARTED', 'QUESTION_ANSWERED', 'QUESTION_SKIPPED',
  'HINT_REQUESTED', 'SOLUTION_VIEWED', 'RETRY_STARTED',
  'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'ASSESSMENT_ABANDONED',
  'PLAN_ACCEPTED', 'PLAN_MODIFIED', 'PLAN_COMPLETED', 'PLAN_SKIPPED',
  'DIFFICULTY_SELECTED', 'DIFFICULTY_CHANGED',
  'CONFIDENCE_RECORDED', 'STUDENT_CONTEXT_PROVIDED',
]);

export const incomingEventSchema = z.object({
  id: z.string().min(1).optional(),
  studentId: z.string().min(1),
  type: behaviorEventTypeSchema,
  occurredAtUtc: z.string().datetime().optional(),
  timezoneOffsetMinutes: z.number().int().min(-720).max(840),
  sessionId: z.string().optional(),
  assessmentId: z.string().optional(),
  questionId: z.string().optional(),
  topicId: z.string().optional(),
  planId: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  correct: z.boolean().optional(),
  confidencePercent: z.number().min(0).max(100).optional(),
  durationSeconds: z.number().min(0).max(6 * 60 * 60).optional(),
  questionDurationSeconds: z.number().min(0).max(60 * 60).optional(),
  progressFraction: z.number().min(0).max(1).optional(),
  scoreFraction: z.number().min(0).max(1).optional(),
  plannedSessionMinutes: z.number().min(0).max(24 * 60).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IncomingEventInput = z.infer<typeof incomingEventSchema>;
