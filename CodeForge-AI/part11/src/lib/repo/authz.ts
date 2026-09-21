import type { Pool, PoolClient } from "pg";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(what: string) {
    super(`Not authorized to access ${what}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Confirms `incidentId` exists AND is owned by `userId`, throwing
 * NotFoundError (not ForbiddenError) if it belongs to someone else —
 * deliberately not distinguishing "doesn't exist" from "exists but isn't
 * yours" in the error a caller sees, so student A can't use error-message
 * differences to enumerate student B's incident IDs. This is the
 * application-layer half of student isolation; db/migrations/0002's RLS
 * policies are the DB-layer half (tested independently in
 * tests/rls.test.ts).
 */
export async function assertIncidentOwnership(
  db: Pool | PoolClient,
  incidentId: string,
  userId: string
): Promise<void> {
  const res = await db.query<{ owner_id: string }>("select owner_id from incidents where id = $1", [incidentId]);
  const row = res.rows[0];
  if (!row || row.owner_id !== userId) {
    throw new NotFoundError("Incident");
  }
}
