import { repositories } from '../repositories';
import { logger } from '../utils/logger';
import type { AuthContext } from '../domain/types';

/** Section 53: record sensitive administrative actions. An audit
 * failure should never block the underlying action, but it is
 * surfaced in logs so it can be alerted on. */
export async function recordAudit(
  auth: AuthContext,
  action: string,
  target?: { type: string; id: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await repositories.audit.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action,
      targetType: target?.type,
      targetId: target?.id,
      metadata,
    });
  } catch (err) {
    logger.error({ err, action }, 'Failed to record audit entry.');
  }
}
