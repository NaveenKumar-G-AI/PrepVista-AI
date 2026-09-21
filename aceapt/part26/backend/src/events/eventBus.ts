import { randomUUID } from "crypto";
import { AdaptationEvent, AdaptationEventType } from "../types";
import { Store } from "../db/store";

/**
 * Section 41's event flow (ASSESSMENT_COMPLETED -> CAPABILITY_UPDATED ->
 * ADAPTATION_TRIGGERED -> ... -> PLAN_RECOMPUTED), implemented as a plain
 * append-only log rather than a real message queue. Swap this for
 * PrepVista's existing event/queue infrastructure (section 54) by
 * reimplementing `log` to publish there instead of writing to the store.
 */
export function log(studentId: string, type: AdaptationEventType, summary: string, detail?: Record<string, unknown>): AdaptationEvent {
  const event: AdaptationEvent = {
    id: randomUUID(),
    studentId,
    type,
    summary,
    detail,
    at: new Date().toISOString()
  };
  Store.appendEvent(event);
  return event;
}
