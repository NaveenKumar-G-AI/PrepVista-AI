import { AnalyticsRepository } from "../repositories/analyticsRepository";

export const AnalyticsService = {
  attemptSubmitted(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("attempt_submitted", studentId, payload);
  },
  sessionStarted(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("session_started", studentId, payload);
  },
  sessionCompleted(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("session_completed", studentId, payload);
  },
  hintUsed(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("hint_used", studentId, payload);
  },
  masteryVerified(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("mastery_verified", studentId, payload);
  },
  adaptationTriggered(studentId: string, payload: Record<string, unknown>) {
    AnalyticsRepository.record("adaptation_triggered", studentId, payload);
  },
};
