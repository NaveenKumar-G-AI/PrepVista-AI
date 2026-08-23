// api/proactive/_shared.ts
//
// Placeholder wiring shared by every route below. Both exports exist
// purely so the route handlers import from something real — replace both
// with your actual auth/session layer and DI/singleton pattern before
// deploying. requireRole() throws rather than silently returning null so
// this can never be mistaken for "working, just needs a login."

import type { NextRequest } from 'next/server';
import { InMemorySignalRepository, type SignalRepository } from '../../services/signals/repository';

export interface Session {
  userId: string;
  institutionId: string;
  seasonId: string;
  role: 'TPO' | 'STUDENT' | 'MANAGEMENT';
  studentId?: string; // present when role === 'STUDENT'
}

/** STUB — replace with your real session/auth check (next-auth, your JWT
 * middleware, whatever Parts 1-12 already use). Must keep returning null
 * on missing/insufficient auth so every route's 401 branch stays correct
 * once this is wired for real. */
export async function requireRole(_req: NextRequest, _allowed: Session['role'][]): Promise<Session | null> {
  throw new Error('Wire requireRole() in api/proactive/_shared.ts to your real auth/session layer before using these routes.');
}

/** STUB — swap for your real singleton (e.g. a Prisma-backed
 * PrismaSignalRepository — sketch in services/signals/repository.ts).
 * Kept as an in-memory instance here so this bundle has zero external
 * dependencies out of the box. */
let repo: SignalRepository | null = null;
export function getRepository(): SignalRepository {
  if (!repo) repo = new InMemorySignalRepository();
  return repo;
}
