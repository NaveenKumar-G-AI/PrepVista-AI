import { db, genId } from '../../src/lib/db';
import { DepartmentRow } from '../../src/types/models';

function mapRow(row: any): DepartmentRow {
  return {
    id: row.id, institutionId: row.institution_id, name: row.name, code: row.code,
    active: !!row.active, createdAt: row.created_at,
  };
}

export function listDepartments(institutionId: string): DepartmentRow[] {
  return (db.prepare('SELECT * FROM departments WHERE institution_id = ? ORDER BY name').all(institutionId) as any[]).map(mapRow);
}

export function findDepartmentById(id: string): DepartmentRow | undefined {
  const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function createDepartment(input: { institutionId: string; name: string; code: string }): DepartmentRow {
  const id = genId();
  db.prepare('INSERT INTO departments (id, institution_id, name, code) VALUES (?, ?, ?, ?)')
    .run(id, input.institutionId, input.name, input.code);
  return findDepartmentById(id)!;
}

export function setDepartmentActive(id: string, active: boolean): DepartmentRow {
  db.prepare('UPDATE departments SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return findDepartmentById(id)!;
}

export function listInactiveDepartmentsWithActiveUsers(institutionId: string): (DepartmentRow & { activeUserCount: number })[] {
  const rows = db.prepare(`
    SELECT d.*, COUNT(u.id) as active_user_count
    FROM departments d
    JOIN users u ON u.department_id = d.id AND u.status = 'ACTIVE'
    WHERE d.institution_id = ? AND d.active = 0
    GROUP BY d.id
  `).all(institutionId) as any[];
  return rows.map(r => ({ ...mapRow(r), activeUserCount: r.active_user_count as number }));
}
