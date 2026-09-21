import { repositories } from '../repositories';
import { queue } from '../queue';
import { aggregationService } from '../services/aggregation.service';
import { logger } from '../utils/logger';
import type { IntelligenceEventType } from '../domain/enums';

export interface IncomingIntelligenceEvent {
  organizationId: string;
  studentId: string;
  cohortId?: string;
  eventType: IntelligenceEventType;
  sourceEventId: string;
  sourceTimestamp: string; // ISO 8601
  payload?: Record<string, unknown>;
}

const AGGREGATION_QUEUE = 'cohort-aggregation';

/**
 * Section 35/74/76: an upstream event (assessment/interview/skill
 * evidence) arrives, gets recorded idempotently, and — if it's new —
 * schedules recomputation of only the cohorts that student actually
 * belongs to (never the whole institution — section 36).
 */
export async function ingestIntelligenceEvent(
  evt: IncomingIntelligenceEvent
): Promise<{ accepted: boolean; deduped: boolean }> {
  const recorded = await repositories.events.recordIfNew({
    organizationId: evt.organizationId,
    studentId: evt.studentId,
    cohortId: evt.cohortId ?? null,
    eventType: evt.eventType,
    sourceEventId: evt.sourceEventId,
    sourceTimestamp: new Date(evt.sourceTimestamp),
    payload: evt.payload ?? {},
  });

  if (!recorded) {
    logger.info({ sourceEventId: evt.sourceEventId }, 'Duplicate event ignored (idempotent).');
    return { accepted: true, deduped: true };
  }

  await queue.enqueue(AGGREGATION_QUEUE, {
    organizationId: evt.organizationId,
    studentId: evt.studentId,
    eventRecordId: recorded.id,
  });
  return { accepted: true, deduped: false };
}

interface AggregationJobPayload {
  organizationId: string;
  studentId: string;
  eventRecordId: string;
}

/** Registers the queue consumer. Call once at process startup — both
 * the API server (in single-process/dev mode) and the standalone
 * worker do this, so aggregation runs even without a separate worker
 * process. See src/server.ts / src/worker.ts. */
export function registerAggregationWorker(): void {
  queue.process<AggregationJobPayload>(AGGREGATION_QUEUE, async (payload) => {
    try {
      const affectedCohortIds = await repositories.memberships.listCohortIdsForStudent(
        payload.organizationId,
        payload.studentId
      );

      for (const cohortId of affectedCohortIds) {
        await aggregationService.recomputeAll(payload.organizationId, cohortId);
      }

      await repositories.events.markProcessed(payload.eventRecordId);
      logger.info(
        { studentId: payload.studentId, affectedCohorts: affectedCohortIds.length },
        'Incremental aggregation complete.'
      );
    } catch (err) {
      await repositories.events.markFailed(payload.eventRecordId, (err as Error).message);
      logger.error({ err }, 'Aggregation job failed.');
      throw err;
    }
  });
}
