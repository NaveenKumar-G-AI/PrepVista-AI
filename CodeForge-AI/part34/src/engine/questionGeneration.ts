// ============================================================================
// Phase 10-11 — generate a question, then validate it before it's ever shown
// to a student. "Reject invalid questions. Regenerate safely when
// appropriate" — bounded here at MAX_GENERATION_ATTEMPTS so a persistently
// failing AI provider degrades to question.generation_failed (tracked via
// ObservabilityPort) instead of looping forever or, worse, silently showing
// an invalid question.
// ============================================================================

import { randomUUID } from "node:crypto";
import {
  asQuestionId,
  type EvidenceReference,
  type InterviewMode,
  type Question,
  type QuestionOrigin,
  type RoleId,
  type SessionId,
  type SkillId,
} from "../domain/types.js";
import type { AIGatewayPort } from "../integration/ports.js";
import { AIGatewayError } from "../integration/ports.js";
import { getSkillKeywords } from "../config/skillKeywords.js";
import { buildGroundingContext, type GroundingContext } from "./grounding.js";
import { validateQuestion } from "./questionValidation.js";
import type { StudentEvidenceContext } from "../domain/types.js";

const MAX_GENERATION_ATTEMPTS = 3;

export interface GenerateQuestionInput {
  sessionId: SessionId;
  roleId: RoleId;
  mode: InterviewMode;
  skillId: SkillId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  preferCodeGrounded: boolean;
  studentEvidence: StudentEvidenceContext;
  priorQuestionTexts: string[];
  isFollowUp?: boolean;
  parentQuestionId?: Question["parentQuestionId"];
  followUpTrigger?: Question["followUpTrigger"];
  /** Extra grounded instruction appended to the evidence summaries — used by the follow-up engine to say what happened in the parent question/response (Phase 20), without widening buildGroundingContext's contract. */
  extraInstruction?: string;
  /** How many questions this skill has already had in this session — see AIQuestionGenerationContext for why this matters. */
  priorQuestionCountForSkill: number;
}

export type GenerateQuestionResult =
  | { ok: true; question: Question }
  | { ok: false; reason: "AI_UNAVAILABLE" | "VALIDATION_EXHAUSTED"; attempts: number; lastFailedChecks?: string[] };
export async function generateQuestion(
  aiGateway: AIGatewayPort,
  input: GenerateQuestionInput,
): Promise<GenerateQuestionResult> {
  const grounding: GroundingContext = buildGroundingContext(input.studentEvidence, input.skillId, input.preferCodeGrounded);
  const skillKeywords = getSkillKeywords(input.skillId);
  const evidenceSummaries = input.extraInstruction ? [...grounding.evidenceSummaries, input.extraInstruction] : grounding.evidenceSummaries;

  let lastFailedChecks: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let generated;
    try {
      generated = await aiGateway.generateQuestion({
        roleId: input.roleId,
        skillId: input.skillId,
        mode: input.mode,
        difficulty: input.difficulty,
        evidenceSummaries,
        codeExcerpt: grounding.codeExcerpt ? { language: grounding.codeExcerpt.language, content: grounding.codeExcerpt.content } : undefined,
        priorQuestionTextsInSession: input.priorQuestionTexts,
        priorQuestionCountForSkill: input.priorQuestionCountForSkill,
      });
    } catch (err) {
      if (err instanceof AIGatewayError) {
        return { ok: false, reason: "AI_UNAVAILABLE", attempts: attempt };
      }
      throw err;
    }

    const validation = validateQuestion({
      text: generated.text,
      skillId: input.skillId,
      skillKeywords,
      groundedOn: generated.groundedOn,
      evidenceSummariesOffered: evidenceSummaries,
      priorQuestionTexts: input.priorQuestionTexts,
      requestedDifficulty: input.difficulty,
    });

    if (validation.isValid) {      const groundedIn: EvidenceReference[] = grounding.codeExcerpt
        ? [{ sourceType: "PROJECT_SUBMISSION", sourceId: grounding.codeExcerpt.excerptId as unknown as EvidenceReference["sourceId"], description: "Code excerpt used to ground this question", capturedAt: new Date().toISOString() }]
        : [];

      const origin: QuestionOrigin = input.isFollowUp ? "FOLLOW_UP" : "AI_GENERATED";

      const question: Question = {
        id: asQuestionId(`q_${randomUUID()}`),
        sessionId: input.sessionId,
        skillId: input.skillId,
        mode: input.mode,
        text: generated.text,
        origin,
        difficulty: input.difficulty,
        groundedIn,
        isFollowUp: input.isFollowUp ?? false,
        parentQuestionId: input.parentQuestionId,
        followUpTrigger: input.followUpTrigger,
        validation,
        askedAt: new Date().toISOString(),
      };
      return { ok: true, question };
    }

    lastFailedChecks = validation.failedChecks;
    // Loop again: a fresh generateQuestion call is a genuinely new sample
    // from the model, not a repeat of the same failed text.
  }

  return { ok: false, reason: "VALIDATION_EXHAUSTED", attempts: MAX_GENERATION_ATTEMPTS, lastFailedChecks };
}
