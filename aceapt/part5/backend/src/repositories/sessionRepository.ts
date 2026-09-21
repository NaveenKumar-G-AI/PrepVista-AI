import { db } from "../db/client";
import { Difficulty, DifficultyDimension, SessionStatus } from "../domain/enums";
import { PracticeSession } from "../domain/types";

function rowToSession(row: any): PracticeSession {
  return {
    id: row.id,
    studentId: row.student_id,
    mode: row.mode,
    objective: row.objective,
    objectiveReason: row.objective_reason,
    skillFocus: JSON.parse(row.skill_focus),
    plan: JSON.parse(row.plan),
    planIndex: row.plan_index,
    questionsServed: JSON.parse(row.questions_served),
    attempts: JSON.parse(row.attempts),
    currentDifficulty: row.current_difficulty,
    currentFocusDimension: row.current_focus_dimension ?? undefined,
    status: row.status as SessionStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    adaptationLog: JSON.parse(row.adaptation_log),
    verificationStage: row.verification_stage ?? undefined,
    currentQuestionServedAt: row.current_question_served_at,
    currentQuestionHintsUsed: row.current_question_hints_used,
  };
}

export const SessionRepository = {
  create(session: PracticeSession) {
    db.prepare(
      `INSERT INTO sessions
        (id, student_id, mode, objective, objective_reason, skill_focus, plan, plan_index,
         questions_served, attempts, current_difficulty, current_focus_dimension, status,
         started_at, completed_at, adaptation_log, verification_stage,
         current_question_served_at, current_question_hints_used)
       VALUES (@id, @studentId, @mode, @objective, @objectiveReason, @skillFocus, @plan, @planIndex,
         @questionsServed, @attempts, @currentDifficulty, @currentFocusDimension, @status,
         @startedAt, @completedAt, @adaptationLog, @verificationStage,
         @currentQuestionServedAt, @currentQuestionHintsUsed)`
    ).run(serialize(session));
  },

  save(session: PracticeSession) {
    db.prepare(
      `UPDATE sessions SET
        plan_index=@planIndex, questions_served=@questionsServed, attempts=@attempts,
        current_difficulty=@currentDifficulty, current_focus_dimension=@currentFocusDimension,
        status=@status, completed_at=@completedAt, adaptation_log=@adaptationLog,
        verification_stage=@verificationStage, current_question_served_at=@currentQuestionServedAt,
        current_question_hints_used=@currentQuestionHintsUsed
       WHERE id=@id`
    ).run(serialize(session));
  },

  get(id: string): PracticeSession | null {
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any;
    return row ? rowToSession(row) : null;
  },

  findActiveForStudent(studentId: string): PracticeSession | null {
    const row = db
      .prepare(`SELECT * FROM sessions WHERE student_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1`)
      .get(studentId, SessionStatus.IN_PROGRESS) as any;
    return row ? rowToSession(row) : null;
  },

  recentForStudent(studentId: string, limit = 10): PracticeSession[] {
    const rows = db
      .prepare(`SELECT * FROM sessions WHERE student_id = ? ORDER BY started_at DESC LIMIT ?`)
      .all(studentId, limit) as any[];
    return rows.map(rowToSession);
  },
};

function serialize(session: PracticeSession) {
  return {
    ...session,
    skillFocus: JSON.stringify(session.skillFocus),
    plan: JSON.stringify(session.plan),
    questionsServed: JSON.stringify(session.questionsServed),
    attempts: JSON.stringify(session.attempts),
    currentFocusDimension: session.currentFocusDimension ?? null,
    completedAt: session.completedAt ?? null,
    adaptationLog: JSON.stringify(session.adaptationLog),
    verificationStage: session.verificationStage ?? null,
  };
}

export type { Difficulty, DifficultyDimension };
