import { runAsSystem, runInTenantContext } from "../db/tenantContext";
import { emitSecurityEvent } from "./securityEvents.service";
import type { Role } from "../types/identity";

/**
 * SESSION SECURITY + SESSION VISIBILITY
 * -----------------------------------------------------------------------
 * IMPORTANT SCOPING NOTE: migrations/007's RLS policies enforce
 * *organization*-level isolation on app_session, same as every other
 * tenant table — they do NOT know about "this row belongs to this one
 * user" (that distinction doesn't exist anywhere else in this schema).
 * Two students in the same organization must not see each other's
 * sessions, so every query in this file additionally filters by
 * `user_id = <the caller, or an explicitly-authorized actor>` in
 * application code. RLS is the org-level backstop; self-scoping here is
 * a deliberate, explicit application-layer control on top of it — not an
 * oversight.
 *
 * INTEGRATION NOTE: nothing in Feature 40 issues the actual Supabase
 * session/JWT — createSession() is meant to be called by the real
 * CodeForge backend right after a successful Supabase login (e.g. from a
 * post-login hook), so there is a trackable row to revoke/list later. If
 * that hook is never wired in, identity.sessionId is simply null for
 * every request (see middleware/identity.ts) and session
 * revocation/visibility is unavailable — the rest of Feature 40 does not
 * depend on it.
 */

export interface CreateSessionInput {
  userId: string;
  organizationId: string | null;
  deviceLabel?: string;
  approximateLocation?: string;
  ipAddress?: string;
  expiresAt: Date;
}

export async function createSession(input: CreateSessionInput) {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO app_session (user_id, organization_id, device_label, approximate_location, ip_address, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [input.userId, input.organizationId, input.deviceLabel ?? null, input.approximateLocation ?? null, input.ipAddress ?? null, input.expiresAt]
    );
    return rows[0];
  });
}

export async function listOwnSessions(identity: { userId: string; organizationId: string | null; role: Role }) {
  return runInTenantContext(identity, async (client) => {
    const { rows } = await client.query(
      `SELECT id, device_label, approximate_location, status, created_at, last_active_at, expires_at
       FROM app_session
       WHERE user_id = $1
       ORDER BY last_active_at DESC`,
      [identity.userId]
    );
    return rows; // deliberately not selecting ip_address here — SESSION VISIBILITY says expose only device/approx-location/last-activity/created/status
  });
}

export async function touchSessionActivity(sessionId: string) {
  // High-frequency, best-effort — failures here should never affect the
  // request that triggered them.
  try {
    await runAsSystem(async (client) => {
      await client.query(`UPDATE app_session SET last_active_at = now() WHERE id = $1 AND status = 'ACTIVE'`, [sessionId]);
    });
  } catch {
    // intentionally swallowed — see comment above; logging every touch would be log noise, not a security-relevant failure.
  }
}

export class SessionAccessDeniedError extends Error {
  constructor() {
    super("Not permitted to revoke this session.");
    this.name = "SessionAccessDeniedError";
  }
}

/**
 * Self-revoke is always allowed. Revoking someone else's session requires
 * ADMIN+ (same org, enforced by RLS) or PLATFORM_OPERATOR
 * (sessions:revoke:any — checked by the route's requirePermission, not
 * here; this function assumes that gate already ran for the "other
 * user's session" path and only re-confirms via the row actually being
 * visible under the caller's tenant context).
 */
export async function revokeSession(
  identity: { userId: string; organizationId: string | null; role: Role },
  sessionId: string,
  reason: string,
  correlationId: string
) {
  return runInTenantContext(identity, async (client) => {
    const { rows: existingRows } = await client.query(`SELECT * FROM app_session WHERE id = $1`, [sessionId]);
    const existing = existingRows[0];
    if (!existing) return null;

    const isSelf = existing.user_id === identity.userId;
    const isPrivileged = identity.role === "ADMIN" || identity.role === "PLATFORM_OPERATOR";
    if (!isSelf && !isPrivileged) {
      throw new SessionAccessDeniedError();
    }

    const { rows } = await client.query(
      `UPDATE app_session SET status = 'REVOKED', revoked_at = now(), revoked_reason = $1 WHERE id = $2 RETURNING *`,
      [reason, sessionId]
    );

    await emitSecurityEvent({
      eventType: "SESSION_REVOKED",
      actorUserId: identity.userId,
      actorRole: identity.role,
      organizationId: existing.organization_id,
      resourceType: "app_session",
      resourceId: sessionId,
      result: "SUCCESS",
      correlationId,
      metadata: { self: isSelf, reason }
    });

    return rows[0];
  });
}

/** Used by identity.ts (indirectly, via the host app's request path) to fail closed if a token references a session that's no longer ACTIVE. */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(`SELECT status, expires_at FROM app_session WHERE id = $1`, [sessionId]);
    const row = rows[0];
    if (!row) return false;
    if (row.status !== "ACTIVE") return false;
    if (new Date(row.expires_at).getTime() < Date.now()) return false;
    return true;
  });
}
