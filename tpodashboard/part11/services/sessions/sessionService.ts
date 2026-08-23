import { generateToken, hashToken } from '../../src/lib/crypto';
import * as sessionRepo from '../../db/repositories/sessionRepo';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function createSession(userId: string, institutionId: string, meta: { userAgent?: string; ipAddress?: string }) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const session = sessionRepo.createSession({
    userId, institutionId, tokenHash,
    userAgent: meta.userAgent, ipAddress: meta.ipAddress,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return { token, session };
}

export function listSessionsForUser(userId: string) {
  return sessionRepo.listActiveSessionsForUser(userId);
}

export function revokeSession(sessionId: string) {
  sessionRepo.revokeSessionById(sessionId);
}

export function revokeAllForUser(userId: string, exceptSessionId?: string) {
  return sessionRepo.revokeAllSessionsForUser(userId, exceptSessionId);
}
