import { db } from '../../src/lib/db';
import { listInactiveDepartmentsWithActiveUsers } from '../../db/repositories/departmentRepo';
import { findExpiredUnusedInvites } from '../../db/repositories/securityTokenRepo';
import { countActiveSessionsForInactiveUsers } from '../../db/repositories/sessionRepo';

export interface DataQualityIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  entityType: string;
  entityId: string;
  reason: string;
  suggestedAction: string;
}

type Check = (institutionId: string) => DataQualityIssue[];

/** A coordinator or faculty member exists with a role that requires a department, but has none assigned. */
const usersMissingDepartment: Check = (institutionId) => {
  const rows = db.prepare(`
    SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.institution_id = ? AND u.department_id IS NULL AND r.name IN ('DEPARTMENT_COORDINATOR', 'FACULTY')
  `).all(institutionId) as any[];
  return rows.map(u => ({
    severity: 'HIGH' as const, entityType: 'User', entityId: u.id,
    reason: `${u.name} has a department-scoped role but no department assigned.`,
    suggestedAction: 'Assign a department to this user.',
  }));
};

/** An invitation was sent but expired before the person accepted it. */
const expiredUnacceptedInvites: Check = (institutionId) => {
  return findExpiredUnusedInvites(institutionId).map(i => ({
    severity: 'MEDIUM' as const, entityType: 'User', entityId: i.userId,
    reason: `Invitation for ${i.userEmail} expired without being accepted.`,
    suggestedAction: 'Re-invite the user.',
  }));
};

/** An invitation has sat unaccepted for a long time, even if not yet expired. */
const staleInvitedAccounts: Check = (institutionId) => {
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT id, email FROM users WHERE institution_id = ? AND status = 'INVITED' AND created_at < ?
  `).all(institutionId, THIRTY_DAYS_AGO) as any[];
  return rows.map(u => ({
    severity: 'LOW' as const, entityType: 'User', entityId: u.id,
    reason: `${u.email} was invited over 30 days ago and has not activated their account.`,
    suggestedAction: 'Follow up, or revoke the invitation.',
  }));
};

/** A session is still active for a user whose account is no longer ACTIVE — this should be structurally impossible; if it ever shows up, it means a revoke step was skipped somewhere. */
const activeSessionsForInactiveUsers: Check = (institutionId) => {
  return countActiveSessionsForInactiveUsers(institutionId).map(s => ({
    severity: 'CRITICAL' as const, entityType: 'Session', entityId: s.sessionId,
    reason: `An active session exists for ${s.userEmail}, whose account is not active.`,
    suggestedAction: 'Investigate and revoke this session immediately.',
  }));
};

/** A department was archived but still has active users assigned to it. */
const inactiveDepartmentsWithActiveUsers: Check = (institutionId) => {
  return listInactiveDepartmentsWithActiveUsers(institutionId).map(d => ({
    severity: 'HIGH' as const, entityType: 'Department', entityId: d.id,
    reason: `Department "${d.name}" is marked inactive but still has ${d.activeUserCount} active user(s) assigned.`,
    suggestedAction: 'Reassign these users to an active department, or reactivate the department.',
  }));
};

/**
 * The full check registry. Each check runs against real Part 11 data
 * (users, departments, sessions, invitations) — the only data this build
 * owns. Once Parts 1-10 exist, their checks (duplicate students, orphan
 * applications, offers without a final selection, ...) register here too;
 * nothing about this engine assumes fewer or more checks than this.
 */
export const DATA_QUALITY_CHECKS: Check[] = [
  usersMissingDepartment,
  expiredUnacceptedInvites,
  staleInvitedAccounts,
  activeSessionsForInactiveUsers,
  inactiveDepartmentsWithActiveUsers,
];
