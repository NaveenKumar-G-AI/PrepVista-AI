import { QuestionRepository } from '../db/repository.js';
import { generateId, now } from '../utils/misc.js';

/** Section 74: append-only audit trail with actor + reason on every state-changing action. */
export class AuditService {
  constructor(private repo: QuestionRepository) {}

  record(event: { questionId: string; action: string; actor: string; reason?: string; metadata?: Record<string, unknown> }): void {
    this.repo.appendAudit({
      id: generateId(),
      questionId: event.questionId,
      action: event.action,
      actor: event.actor,
      reason: event.reason,
      metadata: event.metadata,
      createdAt: now(),
    });
  }

  trail(questionId: string) {
    return this.repo.listAudit(questionId);
  }
}

/**
 * Section 138's event catalog, plus one clearly-documented addition (`question_published`) — see
 * README "Design decisions" for why. In a real deployment, `emit` would forward to whatever
 * analytics pipeline ACEAPT already uses; here it just keeps an in-memory log, which is enough to
 * assert against in tests and to inspect via the admin console / demo script.
 */
export const ANALYTICS_EVENTS = [
  'question_created',
  'question_validation_started',
  'question_validation_completed',
  'question_validation_failed',
  'question_issue_detected',
  'question_reported',
  'question_review_started',
  'question_approved',
  'question_published', // extends the section 138 catalog: publication is a distinct milestone from approval
  'question_rejected',
  'question_suspended',
  'question_restored',
  'question_deprecated',
  'question_retired',
  'question_revalidated',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsRecord {
  event: AnalyticsEvent;
  payload: Record<string, unknown>;
  at: string;
}

export class AnalyticsService {
  private log: AnalyticsRecord[] = [];

  emit(event: AnalyticsEvent, payload: Record<string, unknown> = {}): void {
    this.log.push({ event, payload, at: now() });
  }

  all(): AnalyticsRecord[] {
    return [...this.log];
  }

  countsByEvent(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of this.log) counts[r.event] = (counts[r.event] ?? 0) + 1;
    return counts;
  }
}
