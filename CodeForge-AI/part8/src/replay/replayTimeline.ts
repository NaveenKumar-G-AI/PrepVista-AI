import { InterviewEventRecord } from '../types/domain';

export type ReplayEvent = Pick<InterviewEventRecord, 'id' | 'eventType' | 'payload' | 'createdAt'>;

export interface TimelineEntry {
  eventId: string;
  offsetSeconds: number;
  offsetLabel: string; // "MM:SS", or "H:MM:SS" past an hour
  label: string;
  eventType: string;
  createdAt: string;
}

const EVENT_TIMELINE_LABELS: Record<string, string> = {
  INTERVIEW_CREATED: 'Interview created',
  INTERVIEW_STARTED: 'Interview started',
  PROBLEM_PRESENTED: 'Problem presented',
  CLARIFICATION_REQUESTED: 'Asked for clarification',
  CLARIFICATION_ANSWERED: 'Clarification answered',
  PROBLEM_RESTATED: 'Restated the problem',
  APPROACH_SUBMITTED: 'Explained approach',
  CODE_RUN: 'Ran code',
  TEST_FAILED: 'Test failed',
  TEST_PASSED: 'Tests passed',
  DEBUGGING_STARTED: 'Started debugging',
  STUDENT_TESTED_EDGE_CASE: 'Tested an edge case',
  HINT_REQUESTED: 'Requested a hint',
  FOLLOWUP_ASKED: 'Interviewer asked a follow-up',
  FOLLOWUP_ANSWERED: 'Answered the follow-up',
  CODE_SUBMITTED: 'Submitted code',
  INTERVIEW_SUBMITTED: 'Submitted the interview',
  EVALUATION_STARTED: 'Evaluation started',
  EVALUATION_COMPLETED: 'Evaluation completed',
  INTERVIEW_COMPLETED: 'Interview completed',
  READINESS_UPDATED: 'Readiness updated',
  ROADMAP_UPDATE_TRIGGERED: 'Roadmap update triggered',
  STUDENT_ADAPTED_TO_CONSTRAINT: 'Adapted to a changed constraint',
};

/**
 * PHASE 30: "The replay should be generated from persisted events. Do not
 * fabricate timestamps." Every offset comes directly from
 * event.createdAt minus startedAt — nothing here is interpolated,
 * estimated, or filled in for events that weren't actually logged.
 */
export function buildReplayTimeline(startedAt: string, events: ReplayEvent[]): TimelineEntry[] {
  const start = new Date(startedAt).getTime();
  return [...events]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(e => {
      const offsetSeconds = Math.max(0, Math.round((new Date(e.createdAt).getTime() - start) / 1000));
      return {
        eventId: e.id,
        offsetSeconds,
        offsetLabel: formatOffset(offsetSeconds),
        label: EVENT_TIMELINE_LABELS[e.eventType] ?? humanizeUnknownEventType(e.eventType),
        eventType: e.eventType,
        createdAt: e.createdAt,
      };
    });
}

function formatOffset(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function humanizeUnknownEventType(eventType: string): string {
  return eventType.toLowerCase().replace(/_/g, ' ');
}
