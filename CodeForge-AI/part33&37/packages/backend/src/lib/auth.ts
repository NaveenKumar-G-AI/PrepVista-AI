import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { Role } from '@prisma/client';
import { ROLES } from '@prepvista/shared';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  collegeId: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function generateTokens(payload: JWTPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ userId: payload.userId, type: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });

  // Parse expiresIn to seconds
  const expiresIn = parseExpiresIn(JWT_EXPIRES_IN);

  return { accessToken, refreshToken, expiresIn };
}

function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15m
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string; type: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; type: string };
  } catch {
    return null;
  }
}

export async function storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.session.create({
    data: { userId, refreshToken, expiresAt },
  });
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { refreshToken },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function validateRefreshToken(refreshToken: string): Promise<string | null> {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload || payload.type !== 'refresh') return null;

  const session = await prisma.session.findUnique({
    where: { refreshToken },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return payload.userId;
}

export async function getUserWithCollege(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { college: true, student: true, tpoProfile: true },
  });
}

/* ---- Authorization Helpers ---- */

export function requireRole(...allowedRoles: Role[]) {
  return (payload: JWTPayload): void => {
    if (!allowedRoles.includes(payload.role)) {
      throw new AuthorizationError(`Required role: ${allowedRoles.join(' or ')}`);
    }
  };
}

export function requireCollegeAccess(payload: JWTPayload, targetCollegeId: string): void {
  if (payload.role === 'SUPER_ADMIN') return;
  if (payload.collegeId !== targetCollegeId) {
    throw new AuthorizationError('Access denied: college mismatch');
  }
}

export function requireOwnershipOrRole(payload: JWTPayload, resourceUserId: string, ...allowedRoles: Role[]): void {
  if (payload.userId === resourceUserId) return;
  if (allowedRoles.includes(payload.role)) return;
  throw new AuthorizationError('Access denied: not owner and insufficient role');
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/* ---- Permission Matrix ---- */

export const PERMISSIONS = {
  // Student permissions
  STUDENT: {
    assessments: ['create', 'read_own', 'submit_own'],
    profile: ['read_own', 'update_own'],
    recommendations: ['read_own', 'update_own'],
    progress: ['read_own'],
    skillGraph: ['read_own'],
  },
  // TPO permissions
  TPO: {
    assessments: ['read_college', 'analytics'],
    students: ['read_college', 'export_college'],
    analytics: ['read_college'],
    recommendations: ['read_college'],
    collegeSettings: ['read'],
  },
  // College Admin permissions
  COLLEGE_ADMIN: {
    assessments: ['read_college', 'analytics'],
    students: ['read_college', 'update_college', 'export_college'],
    analytics: ['read_college', 'export'],
    recommendations: ['read_college'],
    collegeSettings: ['read', 'update'],
    users: ['read_college', 'invite', 'manage_roles'],
    featureFlags: ['read_college'],
  },
  // Super Admin permissions
  SUPER_ADMIN: {
    assessments: ['read_all', 'analytics_all'],
    students: ['read_all', 'update_all', 'export_all'],
    analytics: ['read_all', 'export_all'],
    recommendations: ['read_all'],
    collegeSettings: ['read_all', 'update_all'],
    users: ['read_all', 'create', 'update_all', 'delete_all'],
    colleges: ['create', 'read_all', 'update_all', 'delete_all'],
    featureFlags: ['read_all', 'create', 'update_all', 'delete_all'],
    system: ['audit_logs', 'health'],
  },
} as const;

export function hasPermission(role: Role, resource: string, action: string): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource as keyof typeof rolePerms];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action as any);
}