import * as policyRepo from '../../db/repositories/policyRepo';
import { recordAudit } from '../audit/auditService';
import { AuthUser } from '../../src/types/authUser';
import { PolicyRow } from '../../src/types/models';
import { withTransaction } from '../../src/lib/db';

export function listPolicyKeys(institutionId: string) {
  return policyRepo.listActivePolicies(institutionId).map(toPublicPolicy);
}

export function getActivePolicy(institutionId: string, key: string) {
  const p = policyRepo.findActivePolicy(institutionId, key);
  return p ? toPublicPolicy(p) : null;
}

export function getPolicyHistory(institutionId: string, key: string) {
  return policyRepo.listPolicyHistory(institutionId, key).map(toPublicPolicy);
}

export function createPolicyVersion(authUser: AuthUser, input: { key: string; config: unknown; effectiveDate: string; reason?: string }) {
  const previous = policyRepo.findActivePolicy(authUser.institutionId, input.key);
  const nextVersion = (previous?.version ?? 0) + 1;
  const configJson = JSON.stringify(input.config);

  const policy = withTransaction(() => {
    if (previous) policyRepo.supersedePolicy(previous.id);
    return policyRepo.createPolicyVersion({
      institutionId: authUser.institutionId, key: input.key, version: nextVersion,
      effectiveDate: input.effectiveDate, config: configJson, changedById: authUser.id, reason: input.reason,
    });
  });

  recordAudit({
    institutionId: authUser.institutionId, actorId: authUser.id, action: 'policy.version_created',
    entityType: 'Policy', entityId: policy.id,
    oldState: previous ? { version: previous.version, config: JSON.parse(previous.config) } : null,
    newState: { version: policy.version, config: input.config },
    reason: input.reason,
  });

  return toPublicPolicy(policy);
}

function toPublicPolicy(p: PolicyRow) {
  return { ...p, config: JSON.parse(p.config) };
}
