import { AuthUser } from '../../src/types/authUser';
import { recordAudit } from '../audit/auditService';

/**
 * Foundation for Part 12/14's AI orchestrator (spec sections 42-44, 80-82).
 * No AI agent calls this yet — but the boundary is real and testable: every
 * function here derives strictly from the calling user's actual, current
 * RBAC permissions. An AI acting for a Department Coordinator can never be
 * handed a tool mapped to a permission that Coordinator role doesn't hold.
 */
const TOOL_PERMISSION_MAP: Record<string, string> = {
  lookup_students: 'students.read',
  edit_students: 'students.write',
  lookup_applications: 'applications.read',
  generate_report: 'reports.generate',
  send_communication: 'communication.send',
  lookup_readiness: 'readiness.read',
};

export function getAllowedAITools(user: AuthUser): string[] {
  return Object.entries(TOOL_PERMISSION_MAP)
    .filter(([, permission]) => user.permissions.includes(permission))
    .map(([tool]) => tool);
}

export function getAIContextScope(user: AuthUser) {
  const departmentScoped = user.role === 'DEPARTMENT_COORDINATOR' || user.role === 'FACULTY';
  return {
    institutionId: user.institutionId,
    departmentId: departmentScoped ? user.departmentId : null,
  };
}

export function getAIActionPolicy(_user: AuthUser) {
  return {
    requiresConfirmationFor: ['send_communication', 'edit_students'],
    autonomousActionsAllowed: false,
  };
}

export function recordAIAction(user: AuthUser, input: { tool: string; inputIntent: string; confirmed: boolean; result: string }) {
  return recordAudit({
    institutionId: user.institutionId, actorId: user.id, action: 'ai.action_recorded',
    entityType: 'AIAction', entityId: input.tool,
    newState: { tool: input.tool, inputIntent: input.inputIntent, confirmed: input.confirmed, result: input.result },
  });
}
