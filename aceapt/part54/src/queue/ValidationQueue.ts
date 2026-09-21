/**
 * PORT (see /TRUTH_TABLE.md). spec §85: "Use existing queue infrastructure...
 * do not create a second queue system." No ACEAPT repository was reachable
 * this session, so there is no existing queue to reuse — this is a small,
 * real, in-process stand-in behind the same interface a BullMQ/Celery-backed
 * implementation would satisfy. Swap the implementation, not the callers.
 */
export type ValidationPriority = "CRITICAL_ASSESSMENT" | "NEW_PUBLISHED_CONTENT" | "AI_GENERATED" | "IMPORTED" | "NORMAL_REVALIDATION";

const PRIORITY_ORDER: Record<ValidationPriority, number> = {
  CRITICAL_ASSESSMENT: 0,
  NEW_PUBLISHED_CONTENT: 1,
  AI_GENERATED: 2,
  IMPORTED: 3,
  NORMAL_REVALIDATION: 4
};

export interface ValidationJob<T> {
  id: string;
  priority: ValidationPriority;
  payload: T;
  enqueuedAt: number;
}

export interface ValidationQueue<T> {
  enqueue(payload: T, priority: ValidationPriority): Promise<string>;
  /** Pulls and removes the highest-priority, oldest-enqueued job, or null if empty. */
  dequeue(): Promise<ValidationJob<T> | null>;
  size(): Promise<number>;
}

export class InMemoryValidationQueue<T> implements ValidationQueue<T> {
  private jobs: ValidationJob<T>[] = [];
  private counter = 0;

  async enqueue(payload: T, priority: ValidationPriority): Promise<string> {
    const id = `job_${++this.counter}`;
    this.jobs.push({ id, priority, payload, enqueuedAt: Date.now() });
    return id;
  }

  async dequeue(): Promise<ValidationJob<T> | null> {
    if (this.jobs.length === 0) return null;
    let bestIndex = 0;
    for (let i = 1; i < this.jobs.length; i++) {
      const a = this.jobs[i]!;
      const b = this.jobs[bestIndex]!;
      if (PRIORITY_ORDER[a.priority] < PRIORITY_ORDER[b.priority] || (PRIORITY_ORDER[a.priority] === PRIORITY_ORDER[b.priority] && a.enqueuedAt < b.enqueuedAt)) {
        bestIndex = i;
      }
    }
    return this.jobs.splice(bestIndex, 1)[0]!;
  }

  async size(): Promise<number> {
    return this.jobs.length;
  }
}
