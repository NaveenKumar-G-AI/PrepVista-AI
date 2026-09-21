// Analytics events (Section 59), named exactly as specified. In the real
// ACEAPT codebase, swap NoopAnalyticsSink for whatever the existing
// analytics pipeline uses (Section 59: "Follow existing analytics
// conventions") - GoalService only depends on the AnalyticsSink
// interface below.
export type GoalAnalyticsEvent =
  | "goal_created"
  | "goal_creation_completed"
  | "goal_updated"
  | "goal_recalculated"
  | "goal_paused"
  | "goal_resumed"
  | "goal_completed"
  | "goal_milestone_reached"
  | "goal_priority_changed"
  | "goal_viewed"
  | "goal_action_started"
  | "goal_progress_viewed"
  | "goal_history_viewed";

export interface AnalyticsSink {
  track(event: GoalAnalyticsEvent, studentId: string, properties?: Record<string, unknown>): void;
}

export class NoopAnalyticsSink implements AnalyticsSink {
  track(): void {
    // Intentionally does nothing - a real sink is wired in src/server.ts.
  }
}

export class ConsoleAnalyticsSink implements AnalyticsSink {
  track(event: GoalAnalyticsEvent, studentId: string, properties: Record<string, unknown> = {}): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event, studentId, ...properties, at: new Date().toISOString() }));
  }
}
