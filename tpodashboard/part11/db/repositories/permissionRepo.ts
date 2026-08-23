import { db, genId } from '../../src/lib/db';
import { PermissionRow } from '../../src/types/models';

function mapRow(row: any): PermissionRow {
  return { id: row.id, key: row.key, description: row.description };
}

export function upsertPermission(key: string, description: string): PermissionRow {
  const existing = db.prepare('SELECT * FROM permissions WHERE key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE permissions SET description = ? WHERE key = ?').run(description, key);
  } else {
    db.prepare('INSERT INTO permissions (id, key, description) VALUES (?, ?, ?)').run(genId(), key, description);
  }
  return mapRow(db.prepare('SELECT * FROM permissions WHERE key = ?').get(key));
}

export function findPermissionsByKeys(keys: string[]): PermissionRow[] {
  if (keys.length === 0) return [];
  const placeholders = keys.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM permissions WHERE key IN (${placeholders})`).all(...keys) as any[];
  return rows.map(mapRow);
}

export function grantPermissionToRole(roleId: string, permissionId: string): void {
  db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleId, permissionId);
}

export function listPermissionKeysForRole(roleId: string): string[] {
  const rows = db.prepare(`
    SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?
  `).all(roleId) as any[];
  return rows.map(r => r.key as string);
}
