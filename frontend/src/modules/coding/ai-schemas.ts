import { z } from 'zod';
export const mentorInput = z.object({
  mode: z.enum(['hint', 'debug', 'review', 'reasoning', 'concept', 'solution', 'interview', 'project']),
  question: z.string().trim().min(1).max(6000),
  context: z.string().max(12000).default(''),
  code: z.string().max(20000).default(''),
  language: z.enum(['javascript', 'python', 'java', 'cpp', 'text']).default('javascript'),
}).strict();
export type MentorInput = z.infer<typeof mentorInput>;
export const mentorOutput = z.object({ message: z.string().trim().min(1).max(18000), nextStep: z.string().trim().min(1).max(2000) });
export function parseMentorResponse(text: string) {
  return mentorOutput.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
}
