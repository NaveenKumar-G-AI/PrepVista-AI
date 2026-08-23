// PrepVista AI — canonical event registry (Part 16 §24–27)
//
// One name, one shape, one place. If a service needs a new event, add it
// here first — don't let it invent an event name inline.
// Naming convention: DOMAIN_ENTITY_ACTION, past tense.

export const EVENT_SCHEMA_VERSION = 1;

export const CANONICAL_EVENTS = {
  // Part 1 — Foundation
  STUDENT_CREATED: 'STUDENT_CREATED',
  STUDENT_PROFILE_UPDATED: 'STUDENT_PROFILE_UPDATED',
  // Part 3 — Drives / eligibility
  DRIVE_PUBLISHED: 'DRIVE_PUBLISHED',
  ELIGIBILITY_COMPUTED: 'ELIGIBILITY_COMPUTED',
  // Part 4 — Applications
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  // Part 5 — Interviews / results
  INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED',
  RESULT_PUBLISHED: 'RESULT_PUBLISHED',
  // Part 6 — Offers / joining
  OFFER_PUBLISHED: 'OFFER_PUBLISHED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  JOINING_CONFIRMED: 'JOINING_CONFIRMED',
  PLACEMENT_OUTCOME_VERIFIED: 'PLACEMENT_OUTCOME_VERIFIED',
  // Part 8 — Readiness
  READINESS_UPDATED: 'READINESS_UPDATED',
  // Part 9 — Communication
  COMMUNICATION_SENT: 'COMMUNICATION_SENT',
  // Part 13 — Proactive intelligence
  PROACTIVE_SIGNAL_RAISED: 'PROACTIVE_SIGNAL_RAISED',
  // Part 14 — AI actions
  AI_ACTION_PREPARED: 'AI_ACTION_PREPARED',
  AI_ACTION_CONFIRMED: 'AI_ACTION_CONFIRMED',
  AI_ACTION_EXECUTED: 'AI_ACTION_EXECUTED',
};

// §27 — a consumer must not act on the "after" event until the "before"
// event for the *same entity* has already landed.
export const EVENT_ORDER_DEPENDENCIES = {
  JOINING_CONFIRMED: ['OFFER_ACCEPTED'],
  PLACEMENT_OUTCOME_VERIFIED: ['JOINING_CONFIRMED'],
  RESULT_PUBLISHED: ['INTERVIEW_COMPLETED'],
};

// §25 — every event on the bus carries this envelope. No bare payloads.
export function buildEvent({ name, institutionId, entityId, actor, payload, correlationId, causationId }) {
  return {
    name,
    version: EVENT_SCHEMA_VERSION,
    institution_id: institutionId,
    entity_id: entityId,
    actor,
    timestamp: new Date().toISOString(),
    payload,
    correlation_id: correlationId,
    causation_id: causationId ?? null,
  };
}

// §26 — idempotent handling: a duplicate event id is a no-op, not a
// duplicate side effect.
export function makeIdempotentProcessor() {
  const seen = new Set();
  return async function process(eventId, handler) {
    if (seen.has(eventId)) return { processed: false, reason: 'duplicate' };
    const result = await handler();
    seen.add(eventId);
    return { processed: true, result };
  };
}

// §27 — refuse an event if its declared prerequisite hasn't fired yet for
// this entity. `log` is the array of events already appended in this run.
export function checkOrdering(eventName, entityId, log) {
  const deps = EVENT_ORDER_DEPENDENCIES[eventName];
  if (!deps) return { ok: true };
  for (const dep of deps) {
    const seen = log.some((e) => e.name === dep && e.entity_id === entityId);
    if (!seen) return { ok: false, missing: dep };
  }
  return { ok: true };
}

export function appendEvent(log, event) {
  const order = checkOrdering(event.name, event.entity_id, log);
  if (!order.ok) {
    throw new Error(`Out-of-order event: ${event.name} for ${event.entity_id} requires ${order.missing} first`);
  }
  log.push(event);
  return event;
}
