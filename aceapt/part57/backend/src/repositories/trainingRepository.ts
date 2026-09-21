import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { TrainingActivityType } from '../domain/enums';

export interface TrainingAttemptRow {
  id: string;
  tenant_id: string;
  student_id: string;
  shortcut_id: string | null;
  activity_type: TrainingActivityType;
  prompt_ref: string;
  response: string;
  correct: number | null;
  response_time_ms: number | null;
  created_at: string;
}

export function insertTrainingAttempt(input: {
  tenantId: string;
  studentId: string;
  shortcutId: string | null;
  activityType: TrainingActivityType;
  promptRef: string;
  response: unknown;
  correct: boolean | null;
  responseTimeMs?: number | null;
}): TrainingAttemptRow {
  const id = newId('train');
  db.prepare(
    `INSERT INTO shortcut_training_attempts (
      id, tenant_id, student_id, shortcut_id, activity_type, prompt_ref, response, correct, response_time_ms
    ) VALUES (@id, @tenant_id, @student_id, @shortcut_id, @activity_type, @prompt_ref, @response, @correct, @response_time_ms)`
  ).run({
    id,
    tenant_id: input.tenantId,
    student_id: input.studentId,
    shortcut_id: input.shortcutId,
    activity_type: input.activityType,
    prompt_ref: input.promptRef,
    response: JSON.stringify(input.response ?? {}),
    correct: input.correct === null ? null : input.correct ? 1 : 0,
    response_time_ms: input.responseTimeMs ?? null,
  });
  return db.prepare(`SELECT * FROM shortcut_training_attempts WHERE id = ?`).get(id) as TrainingAttemptRow;
}

export function listRecentAttempts(studentId: string, activityType?: TrainingActivityType, limit = 20): TrainingAttemptRow[] {
  if (activityType) {
    return db
      .prepare(`SELECT * FROM shortcut_training_attempts WHERE student_id = ? AND activity_type = ? ORDER BY created_at DESC LIMIT ?`)
      .all(studentId, activityType, limit) as TrainingAttemptRow[];
  }
  return db
    .prepare(`SELECT * FROM shortcut_training_attempts WHERE student_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(studentId, limit) as TrainingAttemptRow[];
}
