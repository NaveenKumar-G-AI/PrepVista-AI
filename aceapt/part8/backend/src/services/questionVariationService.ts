import type { PoolClient } from "pg";
import type { NoveltyLevel, ContextType, Question } from "../types/index.js";
import {
  findUnseenApprovedQuestions,
  findLeastExposedApprovedQuestions,
  listApprovedPromptsForSkill,
  createQuestion,
} from "../repositories/questionRepository.js";
import { logSystemEvent } from "../repositories/systemEventRepository.js";
import { getAIProvider, AIGenerationUnavailableError } from "./ai/index.js";
import { runQuestionQualityPipeline } from "./questionQualityPipeline.js";
import { genId } from "../lib/ids.js";

export class NoQuestionAvailableError extends Error {}

const MAX_GENERATION_ATTEMPTS = 2;

export interface QuestionSelectionParams {
  studentId: string;
  skillId: string;
  skillKey: string;
  skillName: string;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  difficultyTarget?: number;
  /** Question ids already placed into the SAME session plan, so this slot
   *  can't select a question another slot has already claimed before either
   *  has actually been answered (see findUnseenApprovedQuestions's doc
   *  comment for why exposure tracking alone can't catch this). */
  excludeQuestionIds?: string[];
}

/**
 * Selection order (spec sections 12, 26, 27, 47, 52):
 *  1. An already-approved question for this skill/novelty the student has
 *     never seen - cheapest, fastest, no AI call needed.
 *  2. AI-generated equivalent form, gated by the full quality pipeline -
 *     only reached when the seed/approved pool is exhausted for this
 *     student, and only stored as APPROVED (visible to any future student)
 *     once it clears every check.
 *  3. Least-recently-seen approved question, even if this student has seen
 *     it before - keeps a session functional on a small seed pool with no
 *     AI key configured. The resulting evidence row will honestly carry
 *     whatever exposure state that implies (REPEATED/MEMORIZATION_RISK),
 *     never disguised as fresh.
 */
export async function selectQuestionForVerification(client: PoolClient, params: QuestionSelectionParams): Promise<Question> {
  const unseen = await findUnseenApprovedQuestions(client, {
    skillId: params.skillId,
    noveltyLevel: params.noveltyLevel,
    contextType: params.contextType === "REAL_WORLD" ? undefined : params.contextType,
    excludeStudentId: params.studentId,
    excludeQuestionIds: params.excludeQuestionIds,
    limit: 1,
  });
  if (unseen.length > 0) return unseen[0];

  const provider = getAIProvider();
  if (provider) {
    const existingPrompts = (await listApprovedPromptsForSkill(client, params.skillId)).map((p) => p.prompt);
    const referencePrompt = existingPrompts[0];

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const candidate = await provider.generateEquivalentQuestion({
          skillName: params.skillName,
          skillKey: params.skillKey,
          noveltyLevel: params.noveltyLevel,
          contextType: params.contextType,
          difficultyTarget: params.difficultyTarget ?? 0.5,
          referencePrompt,
          avoidPrompts: existingPrompts,
        });

        const quality = runQuestionQualityPipeline(candidate, {
          expectedSkillKey: params.skillKey,
          requestedNovelty: params.noveltyLevel,
          requestedDifficulty: params.difficultyTarget ?? 0.5,
          existingPrompts,
        });

        if (quality.approved) {
          return await createQuestion(client, {
            id: genId(),
            skillId: params.skillId,
            formGroupId: genId(),
            prompt: candidate.prompt,
            choices: candidate.choices,
            correctAnswer: candidate.correctChoiceId,
            explanation: candidate.explanation,
            difficulty: candidate.reportedDifficulty,
            noveltyLevel: params.noveltyLevel,
            contextType: params.contextType,
            expectedTimeSeconds: candidate.expectedTimeSeconds,
            generatedBy: "AI",
            qualityStatus: "APPROVED",
            qualityChecks: { checks: quality.checks },
          });
        }

        await logSystemEvent(client, {
          id: genId(),
          eventType: "question_rejected",
          skillId: params.skillId,
          payload: { attempt, checks: quality.checks },
        });
      } catch (err) {
        if (err instanceof AIGenerationUnavailableError) {
          await logSystemEvent(client, { id: genId(), eventType: "ai_generation_unavailable", skillId: params.skillId, payload: { reason: err.message } });
          break; // no point retrying an unavailable provider
        }
        throw err;
      }
    }
  }

  const fallback = await findLeastExposedApprovedQuestions(client, {
    skillId: params.skillId,
    studentId: params.studentId,
    noveltyLevel: params.noveltyLevel,
    excludeQuestionIds: params.excludeQuestionIds,
    limit: 1,
  });
  if (fallback.length > 0) return fallback[0];

  throw new NoQuestionAvailableError(
    `No question available for skill=${params.skillId} novelty=${params.noveltyLevel} (seed pool exhausted, AI unavailable or exhausted too).`
  );
}
