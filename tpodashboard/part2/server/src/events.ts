import { EventEmitter } from "node:events";

/**
 * Stand-in for "the shared Event Contract from Part 1" (spec Phase 16). This is an
 * in-process emitter so the module is self-contained and testable. When merging into
 * the real repo, replace the two functions below with calls into Part 1's actual event
 * bus (queue, webhook, whatever it is) — nothing else in this module talks to this file
 * directly except through `publish`, so the swap is contained to this one file.
 */
export type DomainEvent =
  | "COMPANY_CREATED"
  | "COMPANY_UPDATED"
  | "COMPANY_ARCHIVED"
  | "RECRUITER_CREATED"
  | "RECRUITER_UPDATED"
  | "RECRUITER_DEACTIVATED"
  | "RECRUITER_ACTIVITY_CREATED"
  | "FOLLOWUP_CREATED"
  | "FOLLOWUP_COMPLETED"
  | "RELATIONSHIP_STAGE_CHANGED";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publish(event: DomainEvent, payload: Record<string, unknown>) {
  emitter.emit(event, { event, payload, publishedAt: new Date().toISOString() });
}

export function subscribe(event: DomainEvent, handler: (e: { event: DomainEvent; payload: Record<string, unknown>; publishedAt: string }) => void) {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}
