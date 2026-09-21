import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Goal, Student, StudentTarget } from '../domain/types';

export function createStudent(db: Database.Database, email: string, name: string, cohortId?: string): Student {
  const id = randomUUID();
  db.prepare(`INSERT INTO students (id, email, name, cohort_id) VALUES (?, ?, ?, ?)`).run(id, email, name, cohortId ?? null);
  return { id, email, name, cohortId: cohortId ?? null };
}

export function getStudentById(db: Database.Database, id: string): Student | undefined {
  const row = db.prepare(`SELECT id, email, name, cohort_id FROM students WHERE id = ?`).get(id) as
    | { id: string; email: string; name: string; cohort_id: string | null }
    | undefined;
  if (!row) return undefined;
  return { id: row.id, email: row.email, name: row.name, cohortId: row.cohort_id };
}

export interface UpsertTargetInput {
  studentId: string;
  targetRoleId: string;
  goal: Goal;
  targetState: string;
  targetDate: string | null;
  dailyMinutes: number;
  preferredLanguage: string;
  focusAreas: string[];
}

/**
 * Sets a new active target. The previous active target row (if any) is
 * deactivated, never deleted or overwritten — Phase 27/28 require role/goal
 * history to survive a switch.
 */
export function setActiveTarget(db: Database.Database, input: UpsertTargetInput): StudentTarget {
  db.prepare(`UPDATE student_targets SET is_active = 0 WHERE student_id = ? AND is_active = 1`).run(input.studentId);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO student_targets (id, student_id, target_role_id, goal, target_state, target_date, daily_minutes, preferred_language, focus_areas, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    input.studentId,
    input.targetRoleId,
    input.goal,
    input.targetState,
    input.targetDate,
    input.dailyMinutes,
    input.preferredLanguage,
    JSON.stringify(input.focusAreas)
  );
  return {
    id,
    studentId: input.studentId,
    targetRoleId: input.targetRoleId,
    goal: input.goal,
    targetState: input.targetState,
    targetDate: input.targetDate,
    dailyMinutes: input.dailyMinutes,
    preferredLanguage: input.preferredLanguage,
    focusAreas: input.focusAreas,
    isActive: true,
  };
}

export function getActiveTarget(db: Database.Database, studentId: string): StudentTarget | undefined {
  const row = db
    .prepare(
      `SELECT id, student_id, target_role_id, goal, target_state, target_date, daily_minutes, preferred_language, focus_areas, is_active
       FROM student_targets WHERE student_id = ? AND is_active = 1`
    )
    .get(studentId) as
    | {
        id: string;
        student_id: string;
        target_role_id: string;
        goal: Goal;
        target_state: string;
        target_date: string | null;
        daily_minutes: number;
        preferred_language: string;
        focus_areas: string;
        is_active: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    studentId: row.student_id,
    targetRoleId: row.target_role_id,
    goal: row.goal,
    targetState: row.target_state,
    targetDate: row.target_date,
    dailyMinutes: row.daily_minutes,
    preferredLanguage: row.preferred_language,
    focusAreas: JSON.parse(row.focus_areas),
    isActive: row.is_active === 1,
  };
}
