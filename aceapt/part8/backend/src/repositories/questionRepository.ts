import type { PoolClient } from "pg";
import type { Question, NoveltyLevel, ContextType, QuestionSource, QuestionQualityStatus } from "../types/index.js";

function mapRow(r: any): Question {
  return {
    id: r.id,
    skillId: r.skill_id,
    formGroupId: r.form_group_id,
    prompt: r.prompt,
    choices: r.choices,
    correctAnswer: r.correct_answer,
    explanation: r.explanation,
    difficulty: Number(r.difficulty),
    noveltyLevel: r.novelty_level,
    contextType: r.context_type,
    expectedTimeSeconds: r.expected_time_seconds,
    generatedBy: r.generated_by,
    qualityStatus: r.quality_status,
    qualityChecks: r.quality_checks,
    createdAt: r.created_at,
  };
}

export interface CreateQuestionInput {
  id: string;
  skillId: string;
  formGroupId: string;
  prompt: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  expectedTimeSeconds: number;
  generatedBy: QuestionSource;
  qualityStatus: QuestionQualityStatus;
  qualityChecks?: Record<string, unknown> | null;
}

export async function createQuestion(client: PoolClient, input: CreateQuestionInput): Promise<Question> {
  const { rows } = await client.query(
    `INSERT INTO questions
       (id, skill_id, form_group_id, prompt, choices, correct_answer, explanation,
        difficulty, novelty_level, context_type, expected_time_seconds, generated_by,
        quality_status, quality_checks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.id,
      input.skillId,
      input.formGroupId,
      input.prompt,
      JSON.stringify(input.choices),
      input.correctAnswer,
      input.explanation,
      input.difficulty,
      input.noveltyLevel,
      input.contextType,
      input.expectedTimeSeconds,
      input.generatedBy,
      input.qualityStatus,
      input.qualityChecks ? JSON.stringify(input.qualityChecks) : null,
    ]
  );
  return mapRow(rows[0]);
}

export async function findQuestionById(client: PoolClient, id: string): Promise<Question | null> {
  const { rows } = await client.query(`SELECT * FROM questions WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** All APPROVED prompts for a skill (used by the duplicate/near-duplicate quality gate). */
export async function listApprovedPromptsForSkill(client: PoolClient, skillId: string): Promise<{ id: string; prompt: string; formGroupId: string }[]> {
  const { rows } = await client.query(
    `SELECT id, prompt, form_group_id FROM questions WHERE skill_id = $1 AND quality_status = 'APPROVED'`,
    [skillId]
  );
  return rows.map((r) => ({ id: r.id, prompt: r.prompt, formGroupId: r.form_group_id }));
}

/**
 * Finds APPROVED questions for a skill/novelty that a given student has NOT
 * already seen (anti-exhaustion for the verification pool). Excludes
 * questions currently flagged MEMORIZATION_RISK for that student.
 *
 * excludeQuestionIds matters even for a student who has never seen anything:
 * question_exposures is only written when a question is ANSWERED
 * (masteryEvidenceService.submitQuestionEvidence), not when it's merely
 * selected into a plan - so building a 5-question plan by calling this
 * function once per slot, with no other exclusion, would happily return the
 * SAME earliest-created unseen question for every slot at that novelty
 * level (nothing about "unseen" changes between calls). The caller
 * (masteryVerificationService.startVerificationSession) accumulates ids as
 * it fills each slot and passes them back in here so a plan can't quietly
 * duplicate a question against itself.
 */
export async function findUnseenApprovedQuestions(
  client: PoolClient,
  params: { skillId: string; noveltyLevel: NoveltyLevel; contextType?: ContextType; excludeStudentId: string; excludeQuestionIds?: string[]; limit: number }
): Promise<Question[]> {
  const { rows } = await client.query(
    `SELECT q.* FROM questions q
     WHERE q.skill_id = $1
       AND q.novelty_level = $2
       AND q.quality_status = 'APPROVED'
       AND ($3::context_type IS NULL OR q.context_type = $3::context_type)
       AND NOT EXISTS (
         SELECT 1 FROM question_exposures qe
         WHERE qe.question_id = q.id AND qe.student_id = $4
       )
       AND NOT (q.id = ANY($6::text[]))
     ORDER BY q.created_at ASC
     LIMIT $5`,
    [params.skillId, params.noveltyLevel, params.contextType ?? null, params.excludeStudentId, params.limit, params.excludeQuestionIds ?? []]
  );
  return rows.map(mapRow);
}

/** Fallback pool: approved questions for a skill/novelty regardless of exposure,
 *  ranked so the least-recently-seen-by-this-student come first. Used only when
 *  findUnseenApprovedQuestions can't fill the plan and AI generation is unavailable
 *  or also exhausted - keeps verification sessions functional in a small seed pool.
 *  Same within-plan exclusion concern as findUnseenApprovedQuestions applies here. */
export async function findLeastExposedApprovedQuestions(
  client: PoolClient,
  params: { skillId: string; noveltyLevel: NoveltyLevel; studentId: string; excludeQuestionIds?: string[]; limit: number }
): Promise<Question[]> {
  const { rows } = await client.query(
    `SELECT q.* FROM questions q
     LEFT JOIN question_exposures qe ON qe.question_id = q.id AND qe.student_id = $2
     WHERE q.skill_id = $1 AND q.novelty_level = $3 AND q.quality_status = 'APPROVED'
       AND NOT (q.id = ANY($5::text[]))
     ORDER BY COALESCE(qe.last_seen_at, TIMESTAMPTZ '-infinity') ASC, COALESCE(qe.seen_count, 0) ASC
     LIMIT $4`,
    [params.skillId, params.studentId, params.noveltyLevel, params.limit, params.excludeQuestionIds ?? []]
  );
  return rows.map(mapRow);
}
