import { z } from 'zod';
import { EVALUATION_DIMENSIONS } from '../types/domain';

/**
 * Every AI call in this engine must return one of these shapes, validated
 * before it touches interview state (PHASE 20: "Validate every response. If
 * invalid: retry. If retry fails: fallback. Never let malformed AI output
 * corrupt interview state.").
 */

export const FollowUpQuestionSchema = z.object({
  intent: z.literal('FOLLOW_UP'),
  focus: z.enum(['complexity', 'edge_case', 'alternative_approach', 'optimization', 'data_structure_choice', 'scale']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  question: z.string().min(5),
  reason: z.string().min(5),
});
export type FollowUpQuestion = z.infer<typeof FollowUpQuestionSchema>;

export const ClarificationReplySchema = z.object({
  intent: z.literal('CLARIFICATION_REPLY'),
  answer: z.string().min(1),
  /** If true, the caller should log this as a near-miss and prefer the
   *  deterministic fallback instead — the interviewer must not reveal the
   *  solution (PHASE 7). */
  revealsSolution: z.boolean(),
});
export type ClarificationReply = z.infer<typeof ClarificationReplySchema>;

export const RestatementAssessmentSchema = z.object({
  intent: z.literal('RESTATEMENT_ASSESSMENT'),
  correct: z.boolean(),
  missedAspects: z.array(z.string()),
  /** What the interviewer says next — not a raw grade dump to the student. */
  interviewerResponse: z.string().min(1),
});
export type RestatementAssessment = z.infer<typeof RestatementAssessmentSchema>;

export const HintSchema = z.object({
  intent: z.literal('HINT'),
  level: z.enum(['CLARIFICATION', 'CONCEPTUAL_DIRECTION', 'STRONG_DIRECTION', 'NEAR_SOLUTION']),
  text: z.string().min(1),
});
export type Hint = z.infer<typeof HintSchema>;

/**
 * Note what's deliberately absent: 'INSUFFICIENT_EVIDENCE' is not a legal
 * value here. Whether a dimension has evidence at all is decided
 * deterministically in evaluationEngine.ts *before* the AI is ever called
 * for that dimension — the AI only ever renders a judgment when there is
 * something to judge (PHASE 52).
 */
export const QualitativeAssessmentSchema = z.object({
  intent: z.literal('QUALITATIVE_ASSESSMENT'),
  dimension: z.enum(EVALUATION_DIMENSIONS),
  rating: z.enum(['STRONG', 'COMPETENT', 'DEVELOPING', 'WEAK']),
  rationale: z.string().min(10),
});
export type QualitativeAssessment = z.infer<typeof QualitativeAssessmentSchema>;
