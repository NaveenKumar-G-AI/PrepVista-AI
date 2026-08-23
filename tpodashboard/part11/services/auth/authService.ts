import { hashPassword, verifyPassword, generateToken, hashToken } from '../../src/lib/crypto';
import * as userRepo from '../../db/repositories/userRepo';
import * as securityTokenRepo from '../../db/repositories/securityTokenRepo';
import { createSession, revokeAllForUser } from '../sessions/sessionService';
import { revokeSessionById } from '../../db/repositories/sessionRepo';
import { recordAudit } from '../audit/auditService';
import { Errors } from '../../src/lib/errors';
import { withTransaction } from '../../src/lib/db';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Intentionally identical wording for "no such account", "wrong password", and
// "not yet activated" so a caller cannot use the login endpoint to discover
// which email addresses exist in the system.
const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

export async function login(email: string, password: string, meta: { userAgent?: string; ipAddress?: string }) {
  const user = userRepo.findUserByEmail(email);

  if (!user) {
    throw Errors.unauthorized(GENERIC_LOGIN_ERROR);
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw Errors.unauthorized('This account is temporarily locked. Try again later.');
  }

  if (user.status !== 'ACTIVE' || !user.passwordHash) {
    throw Errors.unauthorized(GENERIC_LOGIN_ERROR);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    userRepo.updateUser(user.id, {
      failedLoginAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : user.lockedUntil,
    });
    recordAudit({
      institutionId: user.institutionId, actorId: null,
      action: locked ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'User', entityId: user.id,
      newState: { email: user.email, attempts },
      ipAddress: meta.ipAddress,
    });
    throw Errors.unauthorized(GENERIC_LOGIN_ERROR);
  }

  userRepo.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() });

  const { token, session } = createSession(user.id, user.institutionId, meta);

  recordAudit({
    institutionId: user.institutionId, actorId: user.id,
    action: 'auth.login_succeeded', entityType: 'User', entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  return { token, session, user };
}

export function logout(sessionId: string, institutionId: string, actorId: string) {
  revokeSessionById(sessionId);
  recordAudit({ institutionId, actorId, action: 'auth.logout', entityType: 'Session', entityId: sessionId });
}

export function logoutAllOthers(userId: string, institutionId: string, currentSessionId: string) {
  const count = revokeAllForUser(userId, currentSessionId);
  recordAudit({
    institutionId, actorId: userId, action: 'auth.logout_all_others',
    entityType: 'User', entityId: userId, newState: { sessionsRevoked: count },
  });
}

export async function changePassword(
  userId: string, institutionId: string, currentPassword: string, newPassword: string, currentSessionId: string,
) {
  const user = userRepo.findUserById(userId);
  if (!user || !user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw Errors.badRequest('Current password is incorrect.');
  }
  const passwordHash = await hashPassword(newPassword);
  userRepo.updateUser(userId, { passwordHash });
  revokeAllForUser(userId, currentSessionId);
  recordAudit({ institutionId, actorId: userId, action: 'auth.password_changed', entityType: 'User', entityId: userId });
}

export async function requestPasswordReset(email: string) {
  const user = userRepo.findUserByEmail(email);
  if (!user) return { devToken: null, user: null };

  const token = generateToken();
  securityTokenRepo.createSecurityToken({
    institutionId: user.institutionId, userId: user.id, purpose: 'PASSWORD_RESET',
    tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
  });
  recordAudit({
    institutionId: user.institutionId, actorId: null, action: 'auth.password_reset_requested',
    entityType: 'User', entityId: user.id,
  });
  return { devToken: token, user };
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const record = securityTokenRepo.findSecurityTokenByHash(hashToken(token));
  if (!record || record.purpose !== 'PASSWORD_RESET' || record.usedAt || new Date(record.expiresAt) < new Date()) {
    throw Errors.badRequest('This reset link is invalid or has expired.');
  }
  const passwordHash = await hashPassword(newPassword);

  withTransaction(() => {
    userRepo.updateUser(record.userId, { passwordHash, failedLoginAttempts: 0, lockedUntil: null });
    securityTokenRepo.markSecurityTokenUsed(record.id);
    revokeAllForUser(record.userId);
  });

  recordAudit({
    institutionId: record.institutionId, actorId: null, action: 'auth.password_reset_completed',
    entityType: 'User', entityId: record.userId,
  });
}
