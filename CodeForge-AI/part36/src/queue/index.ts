import { env } from '../config/env';
import { logger } from '../utils/logger';

export type JobHandler<T> = (payload: T) => Promise<void>;

export interface QueueProvider {
  enqueue<T>(queueName: string, payload: T): Promise<void>;
  process<T>(queueName: string, handler: JobHandler<T>): void;
}

/**
 * Section 33/35: aggregation work happens off the request path via a
 * queue. InMemoryQueue runs jobs on the next tick — zero infra, good
 * for dev/tests/demos. BullMQQueue is the production path once
 * REDIS_URL is set and QUEUE_PROVIDER=bullmq.
 */
class InMemoryQueue implements QueueProvider {
  private handlers = new Map<string, JobHandler<any>>();

  async enqueue<T>(queueName: string, payload: T): Promise<void> {
    const handler = this.handlers.get(queueName);
    if (!handler) {
      logger.warn({ queueName }, 'No handler registered for queue; dropping job.');
      return;
    }
    setImmediate(() => {
      handler(payload).catch((err) => logger.error({ err, queueName }, 'In-memory queue job failed.'));
    });
  }

  process<T>(queueName: string, handler: JobHandler<T>): void {
    this.handlers.set(queueName, handler);
  }
}

class BullMQQueue implements QueueProvider {
  private queues = new Map<string, any>();
  private connection: any;

  constructor(redisUrl: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    // BullMQ requires this setting on any ioredis connection it manages.
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  private getQueue(name: string): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require('bullmq');
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue<T>(queueName: string, payload: T): Promise<void> {
    await this.getQueue(queueName).add(queueName, payload as object, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  process<T>(queueName: string, handler: JobHandler<T>): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Worker } = require('bullmq');
    new Worker(queueName, async (job: { data: T }) => handler(job.data), { connection: this.connection });
  }
}

export const queue: QueueProvider =
  env.QUEUE_PROVIDER === 'bullmq' && env.REDIS_URL ? new BullMQQueue(env.REDIS_URL) : new InMemoryQueue();
