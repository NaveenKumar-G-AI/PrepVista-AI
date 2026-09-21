export const EVENT_TYPES = [
  'DIAGNOSTIC_CREATED',
  'INTERVENTION_RECOMMENDED',
  'INTERVENTION_STARTED',
  'INTERVENTION_COMPLETED',
  'HINT_REQUESTED',
  'EXPLANATION_CHANGED',
  'RECOVERY_SESSION_STARTED',
  'RECOVERY_SESSION_COMPLETED',
  'INTERVENTION_FAILED',
  'INTERVENTION_SUCCEEDED',
  'REASSESSMENT_COMPLETED',
  'INTERVENTION_ESCALATED',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEvent {
  id: string; // idempotency key
  type: EventType;
  studentId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
