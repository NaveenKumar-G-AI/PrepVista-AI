import { RetentionEvent, RetentionEventType } from './eventTypes';

type Listener = (event: RetentionEvent) => void;

/**
 * In-process pub/sub + an append-only log used by the observability
 * endpoint. Swap for a real event stream (Kafka, SNS, a DB-backed outbox…)
 * behind this same shape when Feature 19 needs to talk to the rest of
 * ACEAPT's infrastructure — nothing else in the codebase depends on the
 * transport, only on `emit`/`on`/`getLog`.
 */
export class EventBus {
  private listeners = new Map<RetentionEventType, Listener[]>();
  private log: RetentionEvent[] = [];

  on(type: RetentionEventType, listener: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }

  emit(event: RetentionEvent): void {
    this.log.push(event);
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }

  getLog(filter?: { studentId?: string; type?: RetentionEventType }): RetentionEvent[] {
    return this.log.filter(
      e =>
        (!filter?.studentId || e.studentId === filter.studentId) &&
        (!filter?.type || e.type === filter.type)
    );
  }
}
