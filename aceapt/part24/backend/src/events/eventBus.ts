import { EventEmitter } from 'events';

export type RecallEventName =
  | 'ASSESSMENT_COMPLETED'
  | 'EVIDENCE_CREATED'
  | 'RETENTION_RECALCULATED'
  | 'MEMORY_STATE_CHANGED'
  | 'RECOVERY_REQUIRED'
  | 'RECOVERY_COMPLETED'
  | 'VERIFICATION_SCHEDULED'
  | 'VERIFICATION_COMPLETED'
  | 'PATHFINDER_UPDATED'
  | 'READINESS_UPDATED';

/**
 * Deliberately loose coupling (spec section 58): the recall service emits
 * named events and doesn't know or care who's listening. In this
 * standalone slice the only listener is a console logger, standing in for
 * where a real Feature 22 (Pathfinder) / Feature 23 (Proof) subscriber, or
 * a message queue, would attach in production.
 */
class RecallEventBus extends EventEmitter {
  emitRecall(name: RecallEventName, payload: unknown) {
    this.emit(name, payload);
  }
}

export const recallEventBus = new RecallEventBus();

export function attachDemoLogging() {
  const names: RecallEventName[] = [
    'ASSESSMENT_COMPLETED',
    'EVIDENCE_CREATED',
    'RETENTION_RECALCULATED',
    'MEMORY_STATE_CHANGED',
    'RECOVERY_REQUIRED',
    'RECOVERY_COMPLETED',
    'VERIFICATION_SCHEDULED',
    'VERIFICATION_COMPLETED',
    'PATHFINDER_UPDATED',
    'READINESS_UPDATED',
  ];
  names.forEach((name) => {
    recallEventBus.on(name, (payload) => {
      // eslint-disable-next-line no-console
      console.log(`[event] ${name}`, JSON.stringify(payload));
    });
  });
}
