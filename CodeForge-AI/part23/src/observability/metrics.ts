// ============================================================================
// Observability (Section 47)
// ============================================================================
// Structured event shapes + a console sink for local dev. Swap
// ConsoleMetricsSink for your project's real sink (OpenTelemetry, Datadog,
// etc.) in production — this exists so instrumentation isn't an
// afterthought and the *shape* of what to track is explicit and typed.
//
// Every event below is identifiers, counts, and enum values only —
// deliberately never source code, hypothesis text, or coaching question
// content (Section 47: "Do not unnecessarily log source code or private
// notes.").
// ============================================================================

export type MetricEvent =
  | { type: "coach_request_latency"; correlationId: string; coachStateId: string; bucket: string; durationMs: number }
  | { type: "ai_latency"; correlationId: string; provider: string; durationMs: number; success: boolean }
  | { type: "provider_failure"; correlationId: string; provider: string; errorClass: string }
  | { type: "action_selected"; correlationId: string; coachStateId: string; action: string; aiGenerated: boolean; informationGain: string }
  | { type: "hint_escalation"; correlationId: string; coachStateId: string; fromLevel: string; toLevel: string }
  | { type: "hypothesis_refinement"; correlationId: string; coachStateId: string; hypothesisId: string; qualityBefore?: number; qualityAfter?: number }
  | { type: "resolution"; correlationId: string; coachStateId: string; resolved: boolean }
  | { type: "regression_detected"; correlationId: string; coachStateId: string }
  | { type: "session_completion"; correlationId: string; coachStateId: string; totalActions: number; totalDurationMs: number };

export interface MetricsSink {
  record(event: MetricEvent): void;
}

export class ConsoleMetricsSink implements MetricsSink {
  record(event: MetricEvent): void {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));
  }
}

/** Captures events in memory instead of printing them — useful for tests and for a real sink's unit tests. */
export class InMemoryMetricsSink implements MetricsSink {
  readonly events: MetricEvent[] = [];
  record(event: MetricEvent): void {
    this.events.push(event);
  }
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/** Start a simple wall-clock timer; call the returned function to get elapsed ms. */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
