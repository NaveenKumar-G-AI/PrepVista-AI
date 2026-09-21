export type TelemetryEvent =
  | {
      type: "coach_request_completed";
      correlationId: string;
      provider: string;
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
      retryCount: number;
      success: boolean;
      error?: string;
    }
  | { type: "validation_failure"; correlationId: string; reason: string; attempt: number }
  | { type: "policy_violation"; correlationId: string; reason: string }
  | { type: "grounding_violation"; correlationId: string; issues: unknown }
  | { type: "prompt_injection_suspected"; correlationId: string; sessionId: string }
  | { type: "repeat_hint_suppressed"; correlationId: string; sessionId: string }
  | { type: "provider_error"; correlationId: string; attempt: number; message: string }
  | { type: "rate_limited"; correlationId: string; userId: string };

export interface TelemetrySink {
  emit(event: TelemetryEvent): void;
}

// Groq (gsk_), OpenAI-style (sk-), and Google (AIza) key shapes — defense in
// depth in case a key ever ends up inside a logged string by accident.
const SECRET_PATTERN = /(sk-|gsk_|AIza)[A-Za-z0-9_-]{10,}/g;

export function redact(text: string): string {
  return text.replace(SECRET_PATTERN, "[REDACTED]");
}

export class ConsoleTelemetrySink implements TelemetrySink {
  emit(event: TelemetryEvent): void {
    const safe = JSON.parse(redact(JSON.stringify(event)));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...safe }));
  }
}

/** Collects events in memory instead of printing — handy for tests and for building a real sink around. */
export class InMemoryTelemetrySink implements TelemetrySink {
  readonly events: TelemetryEvent[] = [];
  emit(event: TelemetryEvent): void {
    this.events.push(event);
  }
}
