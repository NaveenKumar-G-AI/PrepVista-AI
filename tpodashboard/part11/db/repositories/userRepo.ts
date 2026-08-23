import { db, genId, nowIso } from '../../src/lib/db';
import { UserRow } from '../../src/types/models';

function mapRow(row: any): UserRow {
  return {
    id: row.id, institutionId: row.institution_id, email: row.email, name: row.name,
    passwordHash: row.password_hash, roleId: row.role_id, departmentId: row.department_id,
    status: row.status, failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until, mfaEnabled: !!row.mfa_enabled,
    lastLoginAt: row.last_login_at, createdAt: row.created_at,
  };
}

export function findUserByEmail(email: string): UserRow | undefined {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return row ? mapRow(row) : undefined;
}

export function findUserById(id: string): UserRow | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function listUsersByInstitution(institutionId: string, departmentId?: string | null): (UserRow & { roleName: string; departmentName: string | null })[] {
  const rows = departmentId
    ? db.prepare(`
        SELECT u.*, r.name as role_name, d.name as department_name
        FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.institution_id = ? AND u.department_id = ? ORDER BY u.created_at DESC
      `).all(institutionId, departmentId)
    : db.prepare(`
        SELECT u.*, r.name as role_name, d.name as department_name
        FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.institution_id = ? ORDER BY u.created_at DESC
      `).all(institutionId);
  return (rows as any[]).map(r => ({ ...mapRow(r), roleName: r.role_name, departmentName: r.department_name }));
}

export function createUser(input: {
  institutionId: string; email: string; name: string; roleId: string;
  departmentId?: string | null; passwordHash?: string | null; status?: string;
}): UserRow {
  const id = genId();
  db.prepare(`INSERT INTO users (id, institution_id, email, name, password_hash, role_id, department_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.institutionId, input.email, input.name, input.passwordHash ?? null,
    input.roleId, input.departmentId ?? null, input.status ?? 'INVITED', nowIso(),
  );
  return findUserById(id)!;
}

const COLUMN_MAP: Record<string, string> = {
  passwordHash: 'password_hash', status: 'status', roleId: 'role_id', departmentId: 'department_id',
  failedLoginAttempts: 'failed_login_attempts', lockedUntil: 'locked_until',
  lastLoginAt: 'last_login_at', mfaEnabled: 'mfa_enabled',
};

export function updateUser(id: string, fields: Partial<{
  passwordHash: string | null; status: string; roleId: string; departmentId: string | null;
  failedLoginAttempts: number; lockedUntil: string | null; lastLoginAt: string | null; mfaEnabled: boolean;
}>): UserRow {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return findUserById(id)!;
  const setClause = keys.map(k => `${COLUMN_MAP[k]} = ?`).join(', ');
  const values = keys.map(k => {
    const v = (fields as any)[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : v;
  });
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values, id);
  return findUserById(id)!;
}

/** Used by the "never remove the last active Super Admin" guard. */
export function countOtherActiveUsersByRoleName(institutionId: string, roleName: string, excludingUserId: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.institution_id = ? AND r.name = ? AND u.status = 'ACTIVE' AND u.id != ?
  `).get(institutionId, roleName, excludingUserId) as any;
  return row.count as number;
}
