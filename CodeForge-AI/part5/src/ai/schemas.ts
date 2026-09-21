import { z } from 'zod';

export const LearningObjectiveSchema = z.object({
  learning_objective: z.string().min(5).max(300),
});

export const AmbiguousEvidenceInterpretationSchema = z.object({
  interpretation: z.string().min(5).max(500),
  recommended_action: z.string().min(3).max(300),
});

export const FeedbackExplanationSchema = z.object({
  explanation: z.string().min(5).max(500),
});
