import { EventEmitter } from 'events';

export type DomainEventType = 'ASSESSMENT_COMPLETED' | 'QUESTION_ATTEMPTED' | 'MASTERY_UPDATED' | 'MISTAKE_CLASSIFIED' | 'RETENTION_UPDATED' | 'GOAL_UPDATED';

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  studentId: string;
  payload: T;
  occurredAt: Date;
}

/**
 * In-process event bus. This is a REFERENCE implementation only (section
 * 67: "do not build an entirely new event architecture if one already
 * exists"). In ACEAPT, replace `publish` calls at the point of origin
 * (wherever QUESTION_ATTEMPTED etc. actually happen today) with a
 * subscription on the platform's real bus, and keep the handlers in
 * ./handlers.ts as the translation layer into skill_evidence_events.
 */
class InProcessEventBus extends EventEmitter {
  publish<T>(event: DomainEvent<T>) {
    this.emit(event.type, event);
  }
  subscribe<T>(type: DomainEventType, handler: (event: DomainEvent<T>) => void | Promise<void>) {
    this.on(type, (event: DomainEvent<T>) => {
      Promise.resolve(handler(event)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`event handler failed for ${type}`, err);
      });
    });
  }
}

export const eventBus = new InProcessEventBus();
eventBus.setMaxListeners(50);
