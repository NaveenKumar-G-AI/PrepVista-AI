import { AuditRepository } from "../repositories/analyticsRepository";

export const AuditService = {
  log(actorId: string | null, action: string, resource: string, metadata: Record<string, unknown> = {}) {
    AuditRepository.log(actorId, action, resource, metadata);
  },
};
