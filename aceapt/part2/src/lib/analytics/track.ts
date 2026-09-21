import { logEvent } from "@/lib/db/repo";

/**
 * Meaningful events only (spec section 65: "Do not track meaningless
 * micro-events"). DIAGNOSTIC_PAUSED/RESUMED from the spec's list are
 * intentionally not modeled as distinct events here — this prototype has
 * no explicit "pause" action; a student closing the tab and returning is
 * handled by the resume logic in the session-state route finding an
 * IN_PROGRESS session, which is simpler and covers the same real need.
 */
export type AnalyticsEventType =
  | "DIAGNOSTIC_STARTED"
  | "QUESTION_PRESENTED"
  | "QUESTION_ANSWERED"
  | "QUESTION_SKIPPED"
  | "CONFIDENCE_CAPTURED"
  | "DIFFICULTY_CHANGED"
  | "DIAGNOSTIC_COMPLETED"
  | "REPORT_GENERATED";

export function track(
  eventType: AnalyticsEventType,
  sessionId: string | null,
  studentId: string | null,
  payload?: unknown
): void {
  try {
    logEvent(eventType, sessionId, studentId, payload);
  } catch (err) {
    // Analytics must never break the diagnostic flow itself.
    console.error("[analytics] failed to log event:", err);
  }
}
