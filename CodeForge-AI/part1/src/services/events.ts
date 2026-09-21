// Step 43 (event data minimization) applies here: payloads carry only the
// ids needed to act on the event, never student display names or other
// PII. No message bus exists in this build environment to publish to, so
// this logs a structured, minimized event instead — replacing the body of
// emitEvent() is the entire integration surface for a real bus.

export type CodeforgeEventName = 'CODEFORGE_ROLE_SELECTED' | 'CODEFORGE_ROLE_CHANGED';

export interface CodeforgeEventPayload {
  student_id: string;
  role_id: string;
  role_version: number;
  source: string;
}

export function emitEvent(name: CodeforgeEventName, payload: CodeforgeEventPayload): void {
  console.log(JSON.stringify({ event: name, payload, emitted_at: new Date().toISOString() }));
}
