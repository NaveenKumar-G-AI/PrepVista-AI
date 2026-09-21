import { db } from "../db/client";
import { Attempt } from "../domain/types";

function rowToAttempt(row: any): Attempt {
  return {
    id: row.id,
    studentId: row.student_id,
    sessionId: row.session_id,
    questionId: row.question_id,
    skillId: row.skill_id,
    selectedOptionId: row.selected_option_id,
    isCorrect: !!row.is_correct,
    timeToStartMs: row.time_to_start_ms,
    totalTimeMs: row.total_time_ms,
    expectedTimeMs: row.expected_time_ms,
    relativeSpeed: row.relative_speed,
    hintsUsed: row.hints_used,
    confidence: row.confidence,
    errorCategory: row.error_category,
    performanceInterpretation: row.performance_interpretation,
    difficultyAtAttempt: JSON.parse(row.difficulty_at_attempt),
    questionIndexInSession: row.question_index_in_session,
    createdAt: row.created_at,
  };
}

export const AttemptRepository = {
  insert(attempt: Attempt) {
    db.prepare(
      `INSERT INTO attempts
        (id, student_id, session_id, question_id, skill_id, selected_option_id, is_correct,
         time_to_start_ms, total_time_ms, expected_time_ms, relative_speed, hints_used, confidence,
         error_category, performance_interpretation, difficulty_at_attempt, question_index_in_session, created_at)
       VALUES (@id, @studentId, @sessionId, @questionId, @skillId, @selectedOptionId, @isCorrect,
         @timeToStartMs, @totalTimeMs, @expectedTimeMs, @relativeSpeed, @hintsUsed, @confidence,
         @errorCategory, @performanceInterpretation, @difficultyAtAttempt, @questionIndexInSession, @createdAt)`
    ).run({
      ...attempt,
      isCorrect: attempt.isCorrect ? 1 : 0,
      difficultyAtAttempt: JSON.stringify(attempt.difficultyAtAttempt),
    });
  },

  /** Most recent attempts for a skill, oldest-first, capped at `limit` — the
   * rolling window every adaptive rule (difficulty, error trends, fatigue) reads. */
  recentForSkill(studentId: string, skillId: string, limit = 5): Attempt[] {
    const rows = db
      .prepare(
        `SELECT * FROM attempts WHERE student_id = ? AND skill_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(studentId, skillId, limit) as any[];
    return rows.map(rowToAttempt).reverse();
  },

  forSession(sessionId: string): Attempt[] {
    const rows = db
      .prepare(`SELECT * FROM attempts WHERE session_id = ? ORDER BY question_index_in_session ASC`)
      .all(sessionId) as any[];
    return rows.map(rowToAttempt);
  },

  countCorrectDistinctStructures(studentId: string, skillId: string): number {
    // "Distinct structures" approximated by distinct question_id — each seed/
    // generated question is a distinct structure by construction (§24 diversity evidence).
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT question_id) as c FROM attempts
         WHERE student_id = ? AND skill_id = ? AND is_correct = 1`
      )
      .get(studentId, skillId) as { c: number };
    return row.c;
  },
};
