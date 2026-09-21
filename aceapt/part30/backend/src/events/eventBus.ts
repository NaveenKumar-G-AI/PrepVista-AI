import { withTenant } from "../db/pool.js";
import { recalculatePath } from "../engine/orchestrator.js";
import type { PathChangeReason } from "../domain/types.js";

export type PathEventType = Exclude<PathChangeReason, "INITIAL_GENERATION" | "MANUAL_RECALCULATION">;

interface QueuedEvent {
  tenantId: string;
  pathId: string;
  type: PathEventType;
  payload?: Record<string, unknown>;
}

/**
 * Section 47: "Where supported, PATH should react to events... avoid
 * excessive synchronous recalculation if the current architecture already
 * has a job/event system." This is an in-process stand-in for that job
 * system -- enqueue() returns immediately, a drain loop processes the
 * queue off the request/response cycle. The seam is deliberately narrow
 * (enqueue + drain) so it can be swapped for a real queue (SQS, a
 * Postgres-backed job table, etc.) without touching any caller.
 *
 * `flush()` exists only for tests and the dev server's graceful shutdown,
 * to deterministically wait for the queue to empty rather than sleeping.
 */
class PathEventBus {
  private queue: QueuedEvent[] = [];
  private draining: Promise<void> | null = null;

  enqueue(event: QueuedEvent): void {
    this.queue.push(event);
    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = null;
      });
    }
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.draining) {
      if (this.draining) await this.draining;
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      try {
        await withTenant(event.tenantId, async (client) => {
          await recalculatePath(client, event.tenantId, event.pathId, event.type);
        });
      } catch (err) {
        // A single bad event must never wedge the whole queue -- log and
        // continue. In production this is where a dead-letter queue or
        // retry-with-backoff would hook in.
        console.error(`eventBus: recalculation failed for path ${event.pathId} (${event.type})`, err);
      }
    }
  }
}

export const pathEventBus = new PathEventBus();
