export type RetentionEventType =
  | 'RETENTION_CHECK_STARTED'
  | 'RECALL_ATTEMPTED'
  | 'RECALL_COMPLETED'
  | 'RETENTION_UPDATED'
  | 'WEAKENING_DETECTED'
  | 'REACTIVATION_STARTED'
  | 'REACTIVATION_COMPLETED'
  | 'TRANSFER_VERIFIED'
  | 'KNOWLEDGE_STABILIZED';

export interface RetentionEvent {
  type: RetentionEventType;
  studentId: string;
  conceptId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}
