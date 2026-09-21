import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { store } from '../data/store';
import { DomainEvent, EventType } from '../types/events';

class TypedEventBus extends EventEmitter {
  /**
   * Emits an event and persists it with an idempotency key derived from its
   * content, so retried/duplicate emissions (e.g. a client retrying a POST)
   * don't produce duplicate downstream effects (Section 40: "reliable and idempotent").
   */
  emitEvent(type: EventType, studentId: string, payload: Record<string, unknown>, idempotencySeed?: string): DomainEvent {
    const seed = idempotencySeed ?? `${type}:${studentId}:${JSON.stringify(payload)}`;
    const id = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
    const event: DomainEvent = {
      id,
      type,
      studentId,
      payload,
      createdAt: new Date().toISOString(),
    };
    const isNew = store.addEventIfNew(event);
    if (isNew) {
      this.emit(type, event);
      this.emit('*', event);
    }
    return event;
  }
}

export const eventBus = new TypedEventBus();
