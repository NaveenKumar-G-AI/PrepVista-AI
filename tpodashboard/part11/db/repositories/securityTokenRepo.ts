import { db, genId, nowIso } from '../../src/lib/db';
import { SecurityTokenRow } from '../../src/types/models';

function mapRow(row: any): SecurityTokenRow {
  return {
    id: row.id, institutionId: row.institution_id, userId: row.user_id, purpose: row.purpose,
    tokenHash: row.token_hash, expiresAt: row.expires_at, usedAt: row.used_at, createdAt: row.created_at,
  };
}

export function createSecurityToken(input: {
  institutionId: string; userId: string; purpose: string; tokenHash: string; expiresAt: string;
}): SecurityTokenRow {
  const id = genId();
  db.prepare(`INSERT INTO security_tokens (id, institution_id, user_id, purpose, token_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, input.institutionId, input.userId, input.purpose, input.tokenHash, input.expiresAt);
  return mapRow(db.prepare('SELECT * FROM security_tokens WHERE id = ?').get(id));
}

export function findSecurityTokenByHash(tokenHash: string): SecurityTokenRow | undefined {
  const row = db.prepare('SELECT * FROM security_tokens WHERE token_hash = ?').get(tokenHash);
  return row ? mapRow(row) : undefined;
}

export function markSecurityTokenUsed(id: string): void {
  db.prepare('UPDATE security_tokens SET used_at = ? WHERE id = ?').run(nowIso(), id);
}

export function findExpiredUnusedInvites(institutionId: string): (SecurityTokenRow & { userEmail: string })[] {
  const rows = db.prepare(`
    SELECT st.*, u.email as user_email FROM security_tokens st JOIN users u ON u.id = st.user_id
    WHERE st.institution_id = ? AND st.purpose = 'INVITE' AND st.used_at IS NULL AND st.expires_at < ?
  `).all(institutionId, nowIso()) as any[];
  return rows.map(r => ({ ...mapRow(r), userEmail: r.user_email }));
}
