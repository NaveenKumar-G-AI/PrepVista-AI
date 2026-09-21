import type { PoolClient } from "pg";
import type { AttemptRecord } from "../../types/accuracy.js";
import type { Difficulty, HintLevel } from "../../types/training.js";
import type { ErrorType } from "../../types/errorTaxonomy.js";

type Queryable = Pick<PoolClient, "query">;

const SELECT_COLUMNS = `
  id, student_id AS "studentId", session_id AS "sessionId", question_id AS "questionId",
  skill_id AS "skillId", sequence_number AS "sequenceNumber", is_correct AS "isCorrect",
  first_error_step AS "firstErrorStep", step_results AS "stepResults", error_type AS "errorType",
  difficulty, is_novel AS "isNovel", hint_level AS "hintLevel",
  response_time_ms AS "responseTimeMs", expected_time_ms AS "expectedTimeMs",
  self_corrected AS "selfCorrected", question_valid AS "questionValid",
  session_position_pct AS "sessionPositionPct", created_at AS "createdAt"
`;

export interface InsertAttemptInput {
  sessionId: string;
  studentId: string;
  questionId: string;
  skillId: string;
  sequenceNumber: number;
  submittedAnswer: unknown;
  isCorrect: boolean;
  firstErrorStep: number | null;
  stepResults: Array<{ step: number; correct: boolean }> | null;
  errorType: ErrorType | null;
  difficulty: Difficulty;
  isNovel: boolean;
  hintLevel: HintLevel;
  responseTimeMs: number | null;
  expectedTimeMs: number | null;
  selfCorrected: boolean;
  questionValid: boolean;
  sessionPositionPct: number | null;
}

/**
 * §96/§134 — the UNIQUE(session_id, sequence_number) constraint means a
 * double-submit at the same position can only ever produce one row.
 * ON CONFLICT DO NOTHING + a null return tells the caller "this slot was
 * already recorded" so it can return the existing attempt instead of
 * erroring — the API layer turns that into "one valid attempt" behavior.
 */
export async function insertAttemptIfAbsent(
  client: Queryable,
  input: InsertAttemptInput
): Promise<AttemptRecord | null> {
  const r = await client.query(
    `INSERT INTO accuracy_training_attempt
       (session_id, student_id, question_id, skill_id, sequence_number, submitted_answer, is_correct,
        first_error_step, step_results, error_type, difficulty, is_novel, hint_level,
        response_time_ms, expected_time_ms, self_corrected, question_valid, session_position_pct)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (session_id, sequence_number) DO NOTHING
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.sessionId,
      input.studentId,
      input.questionId,
      input.skillId,
      input.sequenceNumber,
      JSON.stringify(input.submittedAnswer ?? null),
      input.isCorrect,
      input.firstErrorStep,
      JSON.stringify(input.stepResults),
      input.errorType,
      input.difficulty,
      input.isNovel,
      input.hintLevel,
      input.responseTimeMs,
      input.expectedTimeMs,
      input.selfCorrected,
      input.questionValid,
      input.sessionPositionPct
    ]
  );
  return r.rows[0] ?? null;
}

export async function getAttemptBySequence(
  client: Queryable,
  sessionId: string,
  sequenceNumber: number
): Promise<AttemptRecord | null> {
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS} FROM accuracy_training_attempt WHERE session_id = $1 AND sequence_number = $2`,
    [sessionId, sequenceNumber]
  );
  return r.rows[0] ?? null;
}

export async function getAttemptsForSession(client: Queryable, sessionId: string): Promise<AttemptRecord[]> {
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS} FROM accuracy_training_attempt WHERE session_id = $1 ORDER BY sequence_number ASC`,
    [sessionId]
  );
  return r.rows;
}

export interface AttemptHistoryFilter {
  skillId?: string;
  limit?: number;
}

/** Chronological (oldest first) — every domain function that walks a "career" expects ascending order. */
export async function getAttemptHistory(
  client: Queryable,
  studentId: string,
  filter: AttemptHistoryFilter = {}
): Promise<AttemptRecord[]> {
  const clauses = ["student_id = $1"];
  const values: unknown[] = [studentId];
  let i = 2;

  if (filter.skillId) {
    clauses.push(`skill_id = $${i++}`);
    values.push(filter.skillId);
  }

  const limitClause = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
  // Fetch most-recent-first so LIMIT keeps the recent window, then reverse to chronological order.
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS} FROM accuracy_training_attempt
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC ${limitClause}`,
    values
  );
  return r.rows.reverse();
}
