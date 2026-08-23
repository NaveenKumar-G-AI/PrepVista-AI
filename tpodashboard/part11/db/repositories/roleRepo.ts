import { db, genId } from '../../src/lib/db';
import { RoleRow } from '../../src/types/models';

function mapRow(row: any): RoleRow {
  return {
    id: row.id, institutionId: row.institution_id, name: row.name,
    rank: row.rank, isSystem: !!row.is_system, createdAt: row.created_at,
  };
}

export function findRoleByName(institutionId: string, name: string): RoleRow | undefined {
  const row = db.prepare('SELECT * FROM roles WHERE institution_id = ? AND name = ?').get(institutionId, name);
  return row ? mapRow(row) : undefined;
}

export function findRoleById(id: string): RoleRow | undefined {
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function listRolesByInstitution(institutionId: string): RoleRow[] {
  return (db.prepare('SELECT * FROM roles WHERE institution_id = ? ORDER BY rank DESC').all(institutionId) as any[]).map(mapRow);
}

export function createRole(input: { institutionId: string; name: string; rank: number; isSystem: boolean }): RoleRow {
  const id = genId();
  db.prepare('INSERT INTO roles (id, institution_id, name, rank, is_system) VALUES (?, ?, ?, ?, ?)')
    .run(id, input.institutionId, input.name, input.rank, input.isSystem ? 1 : 0);
  return findRoleById(id)!;
}

export function countUsersForRole(roleId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(roleId) as any;
  return row.count as number;
}
