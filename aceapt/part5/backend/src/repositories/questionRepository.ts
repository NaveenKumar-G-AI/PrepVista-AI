import { db } from "../db/client";
import { QuestionHealth, QuestionType } from "../domain/enums";
import { Question } from "../domain/types";

export interface ExposureRow {
  studentId: string;
  questionId: string;
  seenCount: number;
  correctCount: number;
  lastSeenAt: string | null;
}

export const QuestionRepository = {
  upsert(q: Question) {
    db.prepare(
      `INSERT INTO questions (id, skill_id, question_type, difficulty_level, quality_status, source, template_id, version, created_at, data)
       VALUES (@id, @skillId, @questionType, @difficultyLevel, @qualityStatus, @source, @templateId, @version, @createdAt, @data)
       ON CONFLICT(id) DO UPDATE SET
         skill_id=excluded.skill_id, question_type=excluded.question_type, difficulty_level=excluded.difficulty_level,
         quality_status=excluded.quality_status, source=excluded.source, template_id=excluded.template_id,
         version=excluded.version, data=excluded.data`
    ).run({
      id: q.id,
      skillId: q.skillId,
      questionType: q.questionType,
      difficultyLevel: q.difficulty.level,
      qualityStatus: q.qualityStatus,
      source: q.source,
      templateId: q.templateId ?? null,
      version: q.version,
      createdAt: q.createdAt,
      data: JSON.stringify(q),
    });
  },

  get(id: string): Question | null {
    const row = db.prepare(`SELECT data FROM questions WHERE id = ?`).get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Question) : null;
  },

  /** Only ever returns HEALTHY questions — the quality gate is the single
   * chokepoint that decides what a student is allowed to see (§32, §34, §41). */
  findCandidates(params: { skillId: string; excludeQuestionIds?: string[] }): Question[] {
    const rows = db
      .prepare(
        `SELECT data FROM questions WHERE skill_id = ? AND quality_status = ?`
      )
      .all(params.skillId, QuestionHealth.HEALTHY) as { data: string }[];
    const excluded = new Set(params.excludeQuestionIds ?? []);
    return rows.map((r) => JSON.parse(r.data) as Question).filter((q) => !excluded.has(q.id));
  },

  countHealthyForSkill(skillId: string): number {
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM questions WHERE skill_id = ? AND quality_status = ?`)
      .get(skillId, QuestionHealth.HEALTHY) as { c: number };
    return row.c;
  },

  /** Which of the given question types this skill actually has HEALTHY content for. Used to
   * make mastery criteria skill-aware (§24) — a purely foundational skill with no
   * APPLICATION/TRANSFER content shouldn't be permanently capped below VERIFIED_MASTERY
   * for lacking question types it was never meant to have. */
  availableQuestionTypesForSkill(skillId: string, types: QuestionType[]): Set<QuestionType> {
    if (types.length === 0) return new Set();
    const placeholders = types.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT DISTINCT question_type FROM questions WHERE skill_id = ? AND quality_status = ? AND question_type IN (${placeholders})`)
      .all(skillId, QuestionHealth.HEALTHY, ...types) as { question_type: QuestionType }[];
    return new Set(rows.map((r) => r.question_type));
  },

  getExposure(studentId: string, questionId: string): ExposureRow | null {
    const row = db
      .prepare(`SELECT * FROM question_exposure WHERE student_id = ? AND question_id = ?`)
      .get(studentId, questionId) as any;
    if (!row) return null;
    return {
      studentId: row.student_id,
      questionId: row.question_id,
      seenCount: row.seen_count,
      correctCount: row.correct_count,
      lastSeenAt: row.last_seen_at,
    };
  },

  getExposureMap(studentId: string, questionIds: string[]): Map<string, ExposureRow> {
    if (questionIds.length === 0) return new Map();
    const placeholders = questionIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM question_exposure WHERE student_id = ? AND question_id IN (${placeholders})`)
      .all(studentId, ...questionIds) as any[];
    const map = new Map<string, ExposureRow>();
    for (const row of rows) {
      map.set(row.question_id, {
        studentId: row.student_id,
        questionId: row.question_id,
        seenCount: row.seen_count,
        correctCount: row.correct_count,
        lastSeenAt: row.last_seen_at,
      });
    }
    return map;
  },

  recordExposure(studentId: string, questionId: string, wasCorrect: boolean) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO question_exposure (student_id, question_id, seen_count, correct_count, last_seen_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(student_id, question_id) DO UPDATE SET
         seen_count = seen_count + 1,
         correct_count = correct_count + excluded.correct_count,
         last_seen_at = excluded.last_seen_at`
    ).run(studentId, questionId, wasCorrect ? 1 : 0, now);
  },

  setQualityStatus(id: string, status: QuestionHealth) {
    db.prepare(`UPDATE questions SET quality_status = ? WHERE id = ?`).run(status, id);
  },
};
