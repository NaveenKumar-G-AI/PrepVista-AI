import { PERMISSIONS } from './permissions';

const ALL = PERMISSIONS.map(p => p.key);

/**
 * Default rank + permission matrix applied to every new institution.
 * `rank` governs who may act on whom (see rbac.ts) and is deliberately
 * separate from the permission list, which governs which resources a role
 * may touch at all.
 */
export const ROLE_DEFAULTS: { name: string; rank: number; permissions: string[] }[] = [
  { name: 'SUPER_ADMIN', rank: 100, permissions: ALL },
  { name: 'TPO_HEAD', rank: 90, permissions: ALL },
  {
    name: 'MANAGEMENT', rank: 70,
    permissions: ['reports.read', 'reports.generate', 'policies.read', 'data_quality.read', 'settings.read', 'sessions.read'],
  },
  {
    name: 'PLACEMENT_OFFICER', rank: 60,
    permissions: [
      'students.read', 'students.write',
      'companies.read', 'companies.write',
      'drives.read', 'drives.write', 'drives.publish',
      'applications.read', 'applications.write',
      'interviews.read', 'interviews.write', 'interviews.publish_results',
      'offers.read', 'offers.write', 'offers.publish',
      'training.read', 'training.write',
      'readiness.read',
      'reports.read', 'reports.generate',
      'communication.read', 'communication.send',
      'policies.read',
      'data_quality.read',
      'sessions.read',
    ],
  },
  {
    name: 'DEPARTMENT_COORDINATOR', rank: 50,
    permissions: [
      'students.read', 'applications.read', 'interviews.read', 'readiness.read',
      'reports.read', 'communication.read', 'users.read', 'policies.read', 'sessions.read',
    ],
  },
  {
    name: 'FACULTY', rank: 40,
    permissions: ['students.read', 'readiness.read', 'training.read', 'sessions.read'],
  },
  {
    // Students never receive admin permissions. Their own data access goes
    // through /api/me, which is ownership-scoped rather than permission-gated.
    name: 'STUDENT', rank: 0,
    permissions: ['sessions.read'],
  },
];
