/**
 * Observability.
 *
 * A minimal, dependency-free structured event emitter. It intentionally
 * does NOT hard-wire a specific vendor (Datadog/Prometheus/etc.) — that
 * choice belongs to whatever CodeForge already uses. Wire a `sink` (e.g.
 * one that calls your existing metrics client) at app startup; until then,
 * events are just held for tests/inspection.
 *
 * Per spec: "Do not log sensitive student responses unnecessarily" — event
 * payloads carry ids, counts, and durations, never raw student text.
 */

export type MetricEvent =
  | { type: "assessment_created"; assessmentId: string; challengeId: string }
  | { type: "mental_model_extracted"; assessmentId: string; provider: string | null; latencyMs: number; degraded: boolean }
  | { type: "probe_generated"; assessmentId: string; dimension: string; probeType: string; provider: string | null; latencyMs: number; degraded: boolean }
  | { type: "response_evaluated"; assessmentId: string; probeId: string; result: string; provider: string | null; latencyMs: number; degraded: boolean }
  | { type: "provider_failure"; provider: string; context: string }
  | { type: "injection_pattern_flagged"; assessmentId: string; probeId: string; patterns: string[] }
  | { type: "assessment_completed"; assessmentId: string; classification: string; probesAsked: number; overallConfidence: number }
  | { type: "reassessment_started"; assessmentId: string; originGap: string };

export type MetricSink = (event: MetricEvent, timestamp: string) => void;

class Observability {
  private sinks: MetricSink[] = [];
  private buffer: Array<{ event: MetricEvent; timestamp: string }> = [];
  private readonly bufferCap = 500;

  addSink(sink: MetricSink): void {
    this.sinks.push(sink);
  }

  emit(event: MetricEvent): void {
    const timestamp = new Date().toISOString();
    this.buffer.push({ event, timestamp });
    if (this.buffer.length > this.bufferCap) this.buffer.shift();
    for (const sink of this.sinks) {
      try {
        sink(event, timestamp);
      } catch {
        // A broken metrics sink must never break the request it's observing.
      }
    }
  }

  /** For tests/local inspection only. */
  recentEvents(n = 50): Array<{ event: MetricEvent; timestamp: string }> {
    return this.buffer.slice(-n);
  }

  clear(): void {
    this.buffer = [];
  }
}

export const observability = new Observability();
