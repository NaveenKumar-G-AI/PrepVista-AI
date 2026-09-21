/**
 * Integration Worker
 * Background worker for processing sync jobs and event deliveries
 */
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { syncEngine } from '../services/integration';
import { eventDelivery } from '../services/integration';

const SYNC_WORKER_INTERVAL_MS = 30000; // 30 seconds
const EVENT_WORKER_INTERVAL_MS = 10000; // 10 seconds
const MAX_CONCURRENT_SYNCS = 3;
const MAX_CONCURRENT_DELIVERIES = 10;

let syncWorkerRunning = false;
let eventWorkerRunning = false;
let activeSyncs = 0;

/**
 * Starts the sync job worker
 */
export function startSyncWorker(): void {
  if (syncWorkerRunning) {
    logger.warn('Sync worker already running');
    return;
  }

  syncWorkerRunning = true;
  logger.info('Starting integration sync worker');

  const runSyncWorker = async () => {
    if (!syncWorkerRunning) return;
    if (activeSyncs >= MAX_CONCURRENT_SYNCS) return;

    try {
      // Find pending sync jobs
      const pendingJobs = await prisma.syncJob.findMany({
        where: {
          status: 'PENDING',
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_CONCURRENT_SYNCS - activeSyncs,
      });

      for (const job of pendingJobs) {
        if (activeSyncs >= MAX_CONCURRENT_SYNCS) break;

        activeSyncs++;
        logger.info({ syncJobId: job.id }, 'Starting sync job');

        try {
          await syncEngine.executeSyncJob(job.id);
        } catch (error) {
          logger.error({ err: error, syncJobId: job.id }, 'Sync job failed');
        } finally {
          activeSyncs--;
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Sync worker error');
    }

    if (syncWorkerRunning) {
      setTimeout(runSyncWorker, SYNC_WORKER_INTERVAL_MS);
    }
  };

  runSyncWorker();
}

/**
 * Starts the event delivery worker
 */
export function startEventDeliveryWorker(): void {
  if (eventWorkerRunning) {
    logger.warn('Event delivery worker already running');
    return;
  }

  eventWorkerRunning = true;
  logger.info('Starting event delivery worker');

  const runEventWorker = async () => {
    if (!eventWorkerRunning) return;

    try {
      await eventDelivery.processPendingEvents(undefined, MAX_CONCURRENT_DELIVERIES);
    } catch (error) {
      logger.error({ err: error }, 'Event delivery worker error');
    }

    if (eventWorkerRunning) {
      setTimeout(runEventWorker, EVENT_WORKER_INTERVAL_MS);
    }
  };

  runEventWorker();
}

/**
 * Stops both workers
 */
export function stopWorkers(): void {
  syncWorkerRunning = false;
  eventWorkerRunning = false;
  logger.info('Integration workers stopped');
}

/**
 * Gets worker status
 */
export function getWorkerStatus(): {
  syncWorker: boolean;
  eventWorker: boolean;
  activeSyncs: number;
} {
  return {
    syncWorker: syncWorkerRunning,
    eventWorker: eventWorkerRunning,
    activeSyncs,
  };
}

/**
 * Manual trigger for processing all pending events
 */
export async function processAllPendingEvents(): Promise<void> {
  await eventDelivery.processPendingEvents(undefined, 50);
}

/**
 * Manual trigger for processing all pending sync jobs
 */
export async function processAllPendingSyncJobs(): Promise<void> {
  const pendingJobs = await prisma.syncJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  for (const job of pendingJobs) {
    if (activeSyncs >= MAX_CONCURRENT_SYNCS) break;
    activeSyncs++;
    try {
      await syncEngine.executeSyncJob(job.id);
    } catch (error) {
      logger.error({ err: error, syncJobId: job.id }, 'Manual sync job failed');
    } finally {
      activeSyncs--;
    }
  }
}