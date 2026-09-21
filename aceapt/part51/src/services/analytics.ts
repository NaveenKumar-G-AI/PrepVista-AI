/**
 * §109 — the event names the spec asks for. This module does NOT build a
 * new analytics platform (the spec repeatedly says not to duplicate
 * existing systems, §85/§109 "follow existing analytics patterns"); it's a
 * single `track()` call sites can depend on today, that a real deployment
 * points at ACEAPT's actual analytics pipeline (Segment, an internal event
 * bus, whatever it is) by replacing the body of this one function.
 */
export type AnalyticsEvent =
  | "accuracy_training_started"
  | "accuracy_training_attempt"
  | "accuracy_training_correct"
  | "accuracy_training_error"
  | "accuracy_intervention_selected"
  | "self_correction_started"
  | "self_correction_success"
  | "error_spotting_started"
  | "error_spotting_success"
  | "error_correction_success"
  | "pressure_accuracy_test"
  | "novel_accuracy_test"
  | "independent_accuracy_test"
  | "accuracy_training_completed"
  | "accuracy_training_abandoned";

export function track(event: AnalyticsEvent, props: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return; // keep test output readable
  // eslint-disable-next-line no-console
  console.log(`[analytics] ${event}`, props);
}
