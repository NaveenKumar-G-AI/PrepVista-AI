import { upsertPermission } from '../../db/repositories/permissionRepo';

/**
 * The full permission registry. Populated even for resources this build does
 * not implement (students, drives, offers, ...) because Part 11's job is to
 * expose the RBAC surface that Parts 1-10 will consume once they exist — see
 * docs/PART11_RECONNAISSANCE.md and section 14/79 of the source spec.
 */
export const PERMISSIONS: { key: string; description: string }[] = [
  { key: 'students.read', description: 'View student records' },
  { key: 'students.write', description: 'Create or edit student records' },
  { key: 'companies.read', description: 'View company/recruiter records' },
  { key: 'companies.write', description: 'Create or edit company records' },
  { key: 'drives.read', description: 'View placement drives' },
  { key: 'drives.write', description: 'Create or edit placement drives' },
  { key: 'drives.publish', description: 'Publish a placement drive' },
  { key: 'applications.read', description: 'View applications' },
  { key: 'applications.write', description: 'Edit applications' },
  { key: 'interviews.read', description: 'View interviews' },
  { key: 'interviews.write', description: 'Schedule or edit interviews' },
  { key: 'interviews.publish_results', description: 'Publish interview results' },
  { key: 'offers.read', description: 'View offers' },
  { key: 'offers.write', description: 'Edit offers' },
  { key: 'offers.publish', description: 'Publish or verify offers' },
  { key: 'training.read', description: 'View training modules' },
  { key: 'training.write', description: 'Edit training modules' },
  { key: 'readiness.read', description: 'View readiness scores' },
  { key: 'readiness.configure', description: 'Configure the readiness model' },
  { key: 'reports.read', description: 'View reports' },
  { key: 'reports.generate', description: 'Generate reports' },
  { key: 'reports.export', description: 'Export reports' },
  { key: 'communication.read', description: 'View communications' },
  { key: 'communication.send', description: 'Send communications' },
  { key: 'users.read', description: 'View internal users' },
  { key: 'users.write', description: 'Create, invite, or edit internal users' },
  { key: 'roles.read', description: 'View roles and permissions' },
  { key: 'roles.write', description: 'Create or edit roles' },
  { key: 'policies.read', description: 'View institutional policies' },
  { key: 'policies.write', description: 'Create or edit institutional policies' },
  { key: 'audit.read', description: 'View audit and security event history' },
  { key: 'settings.read', description: 'View institution settings' },
  { key: 'settings.write', description: 'Edit institution settings' },
  { key: 'sessions.read', description: 'View active sessions' },
  { key: 'sessions.revoke', description: "Force-revoke another user's session" },
  { key: 'data_quality.read', description: 'View data quality issues' },
];

export function ensurePermissionRegistry(): void {
  for (const p of PERMISSIONS) upsertPermission(p.key, p.description);
}
