import { randomUUID } from 'crypto';
import { BehaviorEvent } from '../types/events';
import { EventStore, EventQuery } from '../domain/eventStore';

/**
 * In-memory EventStore - the ONLY class in the codebase that knows events
 * live in a JS array. Everything above this (aggregation, signals, API)
 * depends only on the EventStore interface (domain/eventStore.ts), never on
 * this class directly, so swapping in Postgres/Mongo/etc. later means
 * writing one new file, not touching the intelligence layer.
 *
 * State resets on process restart, aside from the demo seed reloaded when
 * DEMO_MODE=true (see demo/seedEvents.ts). Not persisted to disk on purpose
 * - this is a prototype data layer, not a claim that events are durable.
 */
export class InMemoryEventStore implements EventStore {
  private events: BehaviorEvent[] = [];

  async append(event: BehaviorEvent): Promise<BehaviorEvent> {
    // Idempotent on id: a delayed/duplicated delivery of the same event
    // (section 43) does not create a second copy.
    const existingIndex = this.events.findIndex((e) => e.id === event.id);
    const stored: BehaviorEvent = { ...event, id: event.id || randomUUID() };
    if (existingIndex >= 0) {
      this.events[existingIndex] = stored;
    } else {
      this.events.push(stored);
    }
    return stored;
  }

  async query({ studentId, types, sinceUtc }: EventQuery): Promise<BehaviorEvent[]> {
    return this.events
      .filter((e) => e.studentId === studentId)
      .filter((e) => (types ? types.includes(e.type) : true))
      .filter((e) => (sinceUtc ? e.occurredAtUtc >= sinceUtc : true))
      .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  }

  async allStudentIds(): Promise<string[]> {
    return Array.from(new Set(this.events.map((e) => e.studentId)));
  }

  async queryByQuestion(questionId: string): Promise<BehaviorEvent[]> {
    return this.events
      .filter((e) => e.questionId === questionId)
      .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  }
}
