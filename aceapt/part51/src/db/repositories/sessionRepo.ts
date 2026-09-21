import type { PoolClient } from "pg";
import type { Difficulty, SessionState, TrainingType } from "../../types/training.js";
import type { ErrorType } from "../../types/errorTaxonomy.js";

type Queryable = Pick<PoolClient, "query">;

export interface SessionRow {
  id: string;
  studentId: string;
  trainingType: TrainingType;
  targetSkillId: string | null;
  targetErrorType: ErrorType | null;
  difficulty: Difficulty;
  mode: "guided" | "independent";
  status: SessionState;
  questionPlan: string[];
  cursorPosition: number;
  startedAt: string | null;
  completedAt: string | null;
  outcome: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS = `
  id, student_id AS "studentId", training_type AS "trainingType",
  target_skill_id AS "targetSkillId", target_error_type AS "targetErrorType",
  difficulty, mode, status, question_plan AS "questionPlan", cursor_position AS "cursorPosition",
  started_at AS "startedAt", completed_at AS "completedAt", outcome,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function createSession(
  client: Queryable,
  data: {
    studentId: string;
    trainingType: TrainingType;
    targetSkillId: string | null;
    targetErrorType: ErrorType | null;
    difficulty: Difficulty;
    mode: "guided" | "independent";
    questionPlan: string[];
  }
): Promise<SessionRow> {
  const r = await client.query(
    `INSERT INTO accuracy_training_session
       (student_id, training_type, target_skill_id, target_error_type, difficulty, mode, question_plan, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'READY')
     RETURNING ${SELECT_COLUMNS}`,
    [
      data.studentId,
      data.trainingType,
      data.targetSkillId,
      data.targetErrorType,
      data.difficulty,
      data.mode,
      JSON.stringify(data.questionPlan)
    ]
  );
  return r.rows[0];
}

export async function getSession(client: Queryable, sessionId: string): Promise<SessionRow | null> {
  const r = await client.query(`SELECT ${SELECT_COLUMNS} FROM accuracy_training_session WHERE id = $1`, [
    sessionId
  ]);
  return r.rows[0] ?? null;
}

/** §97/§133 — session recovery after a refresh: the student's one currently-active session, if any. */
export async function getActiveSessionForStudent(client: Queryable, studentId: string): Promise<SessionRow | null> {
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS} FROM accuracy_training_session
      WHERE student_id = $1 AND status IN ('READY','ACTIVE','FEEDBACK','RETRY','VERIFICATION')
      ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );
  return r.rows[0] ?? null;
}

export async function updateSessionState(
  client: Queryable,
  sessionId: string,
  patch: Partial<{
    status: SessionState;
    cursorPosition: number;
    difficulty: Difficulty;
    startedAt: string;
    completedAt: string;
    outcome: Record<string, unknown>;
  }>
): Promise<SessionRow> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.status !== undefined) { sets.push(`status = $${i++}`); values.push(patch.status); }
  if (patch.cursorPosition !== undefined) { sets.push(`cursor_position = $${i++}`); values.push(patch.cursorPosition); }
  if (patch.difficulty !== undefined) { sets.push(`difficulty = $${i++}`); values.push(patch.difficulty); }
  if (patch.startedAt !== undefined) { sets.push(`started_at = $${i++}`); values.push(patch.startedAt); }
  if (patch.completedAt !== undefined) { sets.push(`completed_at = $${i++}`); values.push(patch.completedAt); }
  if (patch.outcome !== undefined) { sets.push(`outcome = $${i++}::jsonb`); values.push(JSON.stringify(patch.outcome)); }
  sets.push(`updated_at = now()`);

  values.push(sessionId);
  const r = await client.query(
    `UPDATE accuracy_training_session SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${SELECT_COLUMNS}`,
    values
  );
  return r.rows[0];
}
