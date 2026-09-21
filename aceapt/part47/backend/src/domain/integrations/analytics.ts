/**
 * Analytics event sink (Section 89). Swap ConsoleAnalyticsSink for a real
 * pipeline (Segment/Amplitude/internal warehouse/whatever ACEAPT already
 * uses) - every call site in this codebase depends on the AnalyticsSink
 * interface, never on console.log directly.
 */
export type AnalyticsEventName =
  | 'guided_session_started'
  | 'guided_step_started'
  | 'guided_step_completed'
  | 'guided_step_failed'
  | 'guided_retry'
  | 'guided_hint_requested'
  | 'guided_explanation_requested'
  | 'guided_step_skipped'
  | 'solution_revealed'
  | 'guided_completed'
  | 'independent_verification_started'
  | 'independent_verification_completed'
  | 'transfer_completed'
  | 'guided_abandoned';

export interface AnalyticsSink {
  track(event: AnalyticsEventName, properties: Record<string, unknown>): void;
}

export class ConsoleAnalyticsSink implements AnalyticsSink {
  track(event: AnalyticsEventName, properties: Record<string, unknown>): void {
    console.log(JSON.stringify({ event, ...properties, ts: new Date().toISOString() }));
  }
}
