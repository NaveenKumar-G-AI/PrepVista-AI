import type Database from 'better-sqlite3';
import type { ContextSource, RoleSlot, StudentCareerContext, StudentRoleHistoryEntry } from '../domain/types.js';

interface ContextRow {
  student_id: string;
  primary_role_id: string;
  primary_role_version: number;
  secondary_role_id: string | null;
  secondary_role_version: number | null;
  source: ContextSource;
  selected_at: string;
  updated_at: string;
}

function toContext(row: ContextRow): StudentCareerContext {
  return {
    studentId: row.student_id,
    primaryRoleId: row.primary_role_id,
    primaryRoleVersion: row.primary_role_version,
    secondaryRoleId: row.secondary_role_id,
    secondaryRoleVersion: row.secondary_role_version,
    source: row.source,
    selectedAt: row.selected_at,
    updatedAt: row.updated_at,
  };
}

export class CareerContextRepo {
  constructor(private db: Database.Database) {}

  getStudentById(id: string): { id: string; institutionId: string | null; displayName: string } | null {
    const row = this.db.prepare('select id, institution_id, display_name from student where id = ?').get(id) as
      | { id: string; institution_id: string | null; display_name: string }
      | undefined;
    if (!row) return null;
    return { id: row.id, institutionId: row.institution_id, displayName: row.display_name };
  }

  getContext(studentId: string): StudentCareerContext | null {
    const row = this.db.prepare('select * from student_career_context where student_id = ?').get(studentId) as
      | ContextRow
      | undefined;
    return row ? toContext(row) : null;
  }

  getOpenHistoryRow(studentId: string, slot: RoleSlot): StudentRoleHistoryEntry | null {
    const row = this.db
      .prepare('select * from student_role_history where student_id = ? and slot = ? and ended_at is null')
      .get(studentId, slot) as
      | {
          id: string;
          student_id: string;
          role_id: string;
          role_version: number;
          slot: RoleSlot;
          source: ContextSource;
          started_at: string;
          ended_at: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      studentId: row.student_id,
      roleId: row.role_id,
      roleVersion: row.role_version,
      slot: row.slot,
      source: row.source,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    };
  }

  listHistory(studentId: string): StudentRoleHistoryEntry[] {
    const rows = this.db
      .prepare('select * from student_role_history where student_id = ? order by started_at desc')
      .all(studentId) as Array<{
      id: string;
      student_id: string;
      role_id: string;
      role_version: number;
      slot: RoleSlot;
      source: ContextSource;
      started_at: string;
      ended_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      roleId: row.role_id,
      roleVersion: row.role_version,
      slot: row.slot,
      source: row.source,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }));
  }

  closeHistoryRow(id: string, endedAtIso: string): void {
    this.db.prepare('update student_role_history set ended_at = ? where id = ?').run(endedAtIso, id);
  }

  insertHistoryRow(entry: {
    id: string;
    studentId: string;
    roleId: string;
    roleVersion: number;
    slot: RoleSlot;
    source: ContextSource;
    startedAtIso: string;
  }): void {
    this.db
      .prepare(
        `insert into student_role_history (id, student_id, role_id, role_version, slot, source, started_at)
         values (@id, @studentId, @roleId, @roleVersion, @slot, @source, @startedAtIso)`,
      )
      .run(entry);
  }

  upsertContext(context: {
    studentId: string;
    primaryRoleId: string;
    primaryRoleVersion: number;
    secondaryRoleId: string | null;
    secondaryRoleVersion: number | null;
    source: ContextSource;
    nowIso: string;
  }): void {
    this.db
      .prepare(
        `insert into student_career_context
           (student_id, primary_role_id, primary_role_version, secondary_role_id, secondary_role_version, source, selected_at, updated_at)
         values (@studentId, @primaryRoleId, @primaryRoleVersion, @secondaryRoleId, @secondaryRoleVersion, @source, @nowIso, @nowIso)
         on conflict(student_id) do update set
           primary_role_id = excluded.primary_role_id,
           primary_role_version = excluded.primary_role_version,
           secondary_role_id = excluded.secondary_role_id,
           secondary_role_version = excluded.secondary_role_version,
           source = excluded.source,
           updated_at = excluded.updated_at`,
      )
      .run(context);
  }

  /** Runs `fn` inside a SQLite transaction (Step 58/59: atomic role-change). */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
