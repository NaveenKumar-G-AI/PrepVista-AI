/**
 * Behavior Event Model (spec section 20).
 * Every observation Feature 11 reasons about enters the system as one of
 * these. This is the single source of truth for event shape - aggregation,
 * signal detectors, ingestion validation, and the demo seeder all import
 * from here.
 */
export type BehaviorEventType =
  | 'SESSION_STARTED'
  | 'SESSION_COMPLETED'
  | 'SESSION_ABANDONED'
  | 'QUESTION_STARTED'
  | 'QUESTION_ANSWERED'
  | 'QUESTION_SKIPPED'
  | 'HINT_REQUESTED'
  | 'SOLUTION_VIEWED'
  | 'RETRY_STARTED'
  | 'ASSESSMENT_STARTED'
  | 'ASSESSMENT_COMPLETED'
  | 'ASSESSMENT_ABANDONED'
  | 'PLAN_ACCEPTED'
  | 'PLAN_MODIFIED'
  | 'PLAN_COMPLETED'
  | 'PLAN_SKIPPED'
  | 'DIFFICULTY_SELECTED'
  | 'DIFFICULTY_CHANGED'
  | 'CONFIDENCE_RECORDED'
  | 'STUDENT_CONTEXT_PROVIDED';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface BehaviorEvent {
  id: string;
  studentId: string;
  type: BehaviorEventType;
  /** ISO-8601 timestamp, always stored in UTC. */
  occurredAtUtc: string;
  /** Student-local timezone offset in minutes EAST of UTC (IST = 330). Used only for local-day bucketing (section 43: timezone differences). */
  timezoneOffsetMinutes: number;
  sessionId?: string;
  assessmentId?: string;
  questionId?: string;
  topicId?: string;
  planId?: string;
  difficulty?: Difficulty;
  correct?: boolean;
  /** Self-reported confidence 0-100. Only meaningful on CONFIDENCE_RECORDED events (section 8). */
  confidencePercent?: number;
  /** For SESSION_COMPLETED / SESSION_ABANDONED / ASSESSMENT_* events: total duration in seconds. */
  durationSeconds?: number;
  /** For a single QUESTION_STARTED -> QUESTION_ANSWERED pair. */
  questionDurationSeconds?: number;
  /** Where an assessment/session was left off, as a 0-1 fraction of its length (0.7 = abandoned at 70% through). */
  progressFraction?: number;
  /** Assessment score 0-1, present on ASSESSMENT_COMPLETED. */
  scoreFraction?: number;
  /** Planned session duration in minutes, present on PLAN_ACCEPTED/PLAN_MODIFIED. */
  plannedSessionMinutes?: number;
  /** Free-form, forward-compatible bag for fields not yet modeled explicitly (section 43: schema evolution without migrations). */
  metadata?: Record<string, unknown>;
}

/** Shape accepted by the ingestion endpoint - id/occurredAtUtc may be server-assigned. */
export type IncomingBehaviorEvent = Omit<BehaviorEvent, 'id' | 'occurredAtUtc'> & {
  id?: string;
  occurredAtUtc?: string;
};
