import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { ShortcutUsageRow } from '../domain/types';

export interface NewUsageInput {
  tenantId: string;
  studentId: string;
  shortcutId: string;
  questionId?: string | null;
  questionFamilyId?: string | null;
  applied: boolean;
  correct: boolean;
  responseTimeMs?: number | null;
  baselineTimeMs?: number | null;
  difficulty?: string | null;
  novelty?: string | null;
  mode: string;
  timed?: boolean;
  assisted?: boolean;
}

export function insertUsage(input: NewUsageInput): ShortcutUsageRow {
  const id = newId('usage');
  db.prepare(
    `INSERT INTO shortcut_usages (
      id, tenant_id, student_id, shortcut_id, question_id, question_family_id, applied, correct,
      response_time_ms, baseline_time_ms, difficulty, novelty, mode, timed, assisted
    ) VALUES (@id, @tenant_id, @student_id, @shortcut_id, @question_id, @question_family_id, @applied, @correct,
      @response_time_ms, @baseline_time_ms, @difficulty, @novelty, @mode, @timed, @assisted)`
  ).run({
    id,
    tenant_id: input.tenantId,
    student_id: input.studentId,
    shortcut_id: input.shortcutId,
    question_id: input.questionId ?? null,
    question_family_id: input.questionFamilyId ?? null,
    applied: input.applied ? 1 : 0,
    correct: input.correct ? 1 : 0,
    response_time_ms: input.responseTimeMs ?? null,
    baseline_time_ms: input.baselineTimeMs ?? null,
    difficulty: input.difficulty ?? null,
    novelty: input.novelty ?? null,
    mode: input.mode,
    timed: input.timed ? 1 : 0,
    assisted: input.assisted ? 1 : 0,
  });
  return db.prepare(`SELECT * FROM shortcut_usages WHERE id = ?`).get(id) as ShortcutUsageRow;
}

/** All non-excluded usage for a student+shortcut, most recent first. */
export function listUsages(studentId: string, shortcutId: string): ShortcutUsageRow[] {
  return db
    .prepare(
      `SELECT * FROM shortcut_usages
       WHERE student_id = ? AND shortcut_id = ? AND excluded_reason IS NULL
       ORDER BY created_at DESC`
    )
    .all(studentId, shortcutId) as ShortcutUsageRow[];
}

export function excludeUsage(usageId: string, reason: string): void {
  db.prepare(`UPDATE shortcut_usages SET excluded_reason = ? WHERE id = ?`).run(reason, usageId);
}
