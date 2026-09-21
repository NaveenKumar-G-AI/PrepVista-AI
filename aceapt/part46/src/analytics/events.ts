// Section 94 of the spec. Swap this for your real analytics pipeline
// (segment/amplitude/internal event bus/etc) - callers only depend on
// logEvent(name, payload), so nothing else needs to change.

export type SocraticEventName =
  | "socratic_session_started"
  | "socratic_prompt_answered"
  | "socratic_hint_requested"
  | "socratic_explanation_requested"
  | "socratic_teachback_started"
  | "socratic_teachback_completed"
  | "socratic_independent_attempt"
  | "socratic_verification_completed"
  | "socratic_completed"
  | "socratic_abandoned";

export function logEvent(name: SocraticEventName, payload: Record<string, unknown>): void {
  // Structured, single-line JSON so it's easy to ship to a real sink later.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: name, at: new Date().toISOString(), ...payload }));
}
