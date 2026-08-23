export interface InstitutionRow { id: string; name: string; timezone: string; createdAt: string; }

export interface DepartmentRow {
  id: string; institutionId: string; name: string; code: string; active: boolean; createdAt: string;
}

export interface RoleRow {
  id: string; institutionId: string; name: string; rank: number; isSystem: boolean; createdAt: string;
}

export interface PermissionRow { id: string; key: string; description: string; }

export interface UserRow {
  id: string; institutionId: string; email: string; name: string; passwordHash: string | null;
  roleId: string; departmentId: string | null; status: string; failedLoginAttempts: number;
  lockedUntil: string | null; mfaEnabled: boolean; lastLoginAt: string | null; createdAt: string;
}

export interface SessionRow {
  id: string; userId: string; institutionId: string; tokenHash: string; userAgent: string | null;
  ipAddress: string | null; createdAt: string; lastActiveAt: string; revokedAt: string | null; expiresAt: string;
}

export interface SecurityTokenRow {
  id: string; institutionId: string; userId: string; purpose: string; tokenHash: string;
  expiresAt: string; usedAt: string | null; createdAt: string;
}

export interface PolicyRow {
  id: string; institutionId: string; key: string; version: number; status: string;
  effectiveDate: string; config: string; changedById: string; reason: string | null; createdAt: string;
}

export interface AuditEventRow {
  id: string; institutionId: string; actorId: string | null; action: string; entityType: string;
  entityId: string; oldState: string | null; newState: string | null; reason: string | null;
  ipAddress: string | null; correlationId: string | null; createdAt: string;
}
