export type EventType =
  | 'INTERVENTION_CREATED'
  | 'INTERVENTION_SELECTED'
  | 'INTERVENTION_STARTED'
  | 'INTERVENTION_COMPLETED'
  | 'INTERVENTION_ABANDONED'
  | 'RETENTION_CHECK_STARTED'
  | 'RETENTION_CHECK_COMPLETED'
  | 'TRANSFER_CHECK_STARTED'
  | 'TRANSFER_CHECK_COMPLETED'
  | 'INTERVENTION_OUTCOME_UPDATED'
  | 'INTERVENTION_PROFILE_UPDATED';

export interface AppEvent {
  type: EventType;
  studentId: string;
  payload: Record<string, unknown>;
  at: string;
}

class EventBus {
  private log: AppEvent[] = [];

  emit(type: EventType, studentId: string, payload: Record<string, unknown> = {}): void {
    this.log.push({ type, studentId, payload, at: new Date().toISOString() });
    // In production this would publish to the existing event infrastructure
    // (queue/stream/whatever PrepVista already uses) instead of an in-memory
    // array — see Section 43 and the README's integration notes.
  }

  history(studentId?: string): AppEvent[] {
    return studentId ? this.log.filter(e => e.studentId === studentId) : [...this.log];
  }
}

export const eventBus = new EventBus();
