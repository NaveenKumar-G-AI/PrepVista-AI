import { db, genId, nowIso } from '../../src/lib/db';
import { SessionRow } from '../../src/types/models';

function mapRow(row: any): SessionRow {
  return {
    id: row.id, userId: row.user_id, institutionId: row.institution_id, tokenHash: row.token_hash,
    userAgent: row.user_agent, ipAddress: row.ip_address, createdAt: row.created_at,
    lastActiveAt: row.last_active_at, revokedAt: row.revoked_at, expiresAt: row.expires_at,
  };
}

export function createSession(input: {
  userId: string; institutionId: string; tokenHash: string; userAgent?: string | null;
  ipAddress?: string | null; expiresAt: string;
}): SessionRow {
  const id = genId();
  db.prepare(`INSERT INTO sessions (id, user_id, institution_id, token_hash, user_agent, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.userId, input.institutionId, input.tokenHash, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt,
  );
  return findSessionById(id)!;
}

export function findSessionById(id: string): SessionRow | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function findSessionByTokenHash(tokenHash: string): SessionRow | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
  return row ? mapRow(row) : undefined;
}

export function listActiveSessionsForUser(userId: string): SessionRow[] {
  return (db.prepare('SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC').all(userId) as any[]).map(mapRow);
}

export function touchSessionLastActive(id: string): void {
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(nowIso(), id);
}

export function revokeSessionById(id: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), id);
}

/** Returns the number of sessions revoked. */
export function revokeAllSessionsForUser(userId: string, exceptSessionId?: string): number {
  const result = exceptSessionId
    ? db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?').run(nowIso(), userId, exceptSessionId)
    : db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);
  return Number(result.changes);
}

export function countActiveSessionsForInactiveUsers(institutionId: string): { sessionId: string; userEmail: string }[] {
  const rows = db.prepare(`
    SELECT s.id as session_id, u.email as user_email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.institution_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status != 'ACTIVE'
  `).all(institutionId, nowIso()) as any[];
  return rows.map(r => ({ sessionId: r.session_id, userEmail: r.user_email }));
}
