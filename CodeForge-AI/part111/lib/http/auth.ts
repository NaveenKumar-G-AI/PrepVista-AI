import type { NextRequest } from "next/server";
import { getPool } from "../db/pool";

/**
 * STUB. There is no real authentication system in this environment to
 * integrate with (see docs/ARCHITECTURE.md#not-implemented) — a real
 * CodeForge deployment already has one, and the spec's instruction was
 * to reuse it, not build a new one. This reads a plain header instead
 * of verifying a real session/JWT, which is fine for the tests and
 * demo scripts in this repo and NOT fine to deploy as-is.
 *
 * Swap this implementation for real Supabase session verification
 * (e.g. supabase.auth.getUser(token) against the Authorization header)
 * — every caller of this function only depends on the returned shape,
 * not on how it's derived.
 */
export interface Session {
  userId: string;
  role: "student" | "author" | "admin";
}

export async function resolveSession(req: NextRequest): Promise<Session | null> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;

  const pool = getPool("service");
  const { rows } = await pool.query(`select role from public.profiles where id = $1`, [userId]);
  if (!rows[0]) return null;
  return { userId, role: rows[0].role };
}
