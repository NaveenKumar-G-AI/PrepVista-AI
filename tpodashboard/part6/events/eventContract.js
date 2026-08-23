'use strict';

/**
 * Part 6 defines WHICH events it publishes and their payload shape.
 * It does NOT own the event bus itself - that's Part 1 infrastructure.
 * `publish()` below takes an injected bus so this module has no
 * dependency on how the host repo actually implements pub/sub.
 */

const OFFER_EVENTS = Object.freeze({
  OFFER_CREATED: 'OFFER_CREATED',
  OFFER_UPDATED: 'OFFER_UPDATED',
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  OFFER_VERIFICATION_STARTED: 'OFFER_VERIFICATION_STARTED',
  OFFER_VERIFIED: 'OFFER_VERIFIED',
  OFFER_PUBLISHED: 'OFFER_PUBLISHED',
  OFFER_ACCEPTANCE_PENDING: 'OFFER_ACCEPTANCE_PENDING',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_DECLINED: 'OFFER_DECLINED',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  OFFER_CANCELLED: 'OFFER_CANCELLED',
  OFFER_CORRECTED: 'OFFER_CORRECTED',
  OFFER_DEADLINE_APPROACHING: 'OFFER_DEADLINE_APPROACHING',
  MULTIPLE_OFFER_DETECTED: 'MULTIPLE_OFFER_DETECTED',
});

const JOINING_EVENTS = Object.freeze({
  JOINING_CREATED: 'JOINING_CREATED',
  JOINING_CONFIRMATION_SUBMITTED: 'JOINING_CONFIRMATION_SUBMITTED',
  JOINING_CONFIRMATION_VERIFIED: 'JOINING_CONFIRMATION_VERIFIED',
  JOINING_CONFIRMED: 'JOINING_CONFIRMED',
  JOINING_DELAYED: 'JOINING_DELAYED',
  JOINING_DID_NOT_JOIN: 'JOINING_DID_NOT_JOIN',
  JOINING_DEADLINE_APPROACHING: 'JOINING_DEADLINE_APPROACHING',
});

const PLACEMENT_EVENTS = Object.freeze({
  PLACEMENT_OUTCOME_CREATED: 'PLACEMENT_OUTCOME_CREATED',
  PLACEMENT_OUTCOME_UPDATED: 'PLACEMENT_OUTCOME_UPDATED',
  PLACEMENT_OUTCOME_VERIFIED: 'PLACEMENT_OUTCOME_VERIFIED',
  PLACEMENT_OUTCOME_CORRECTED: 'PLACEMENT_OUTCOME_CORRECTED',
});

const ALL_EVENTS = Object.freeze({ ...OFFER_EVENTS, ...JOINING_EVENTS, ...PLACEMENT_EVENTS });

/**
 * @param {{emit: (name: string, payload: object) => void}} bus - injected, owned by Part 1
 * @param {string} name - must be one of ALL_EVENTS
 * @param {object} payload
 */
function publish(bus, name, payload) {
  if (!Object.values(ALL_EVENTS).includes(name)) {
    throw Object.assign(new Error(`Unknown event: ${name}`), { code: 'UNKNOWN_EVENT' });
  }
  if (!bus || typeof bus.emit !== 'function') {
    throw Object.assign(new Error('publish() requires an injected event bus with an emit() method.'), {
      code: 'MISSING_EVENT_BUS',
    });
  }
  bus.emit(name, { ...payload, emittedAt: new Date().toISOString() });
}

module.exports = { OFFER_EVENTS, JOINING_EVENTS, PLACEMENT_EVENTS, ALL_EVENTS, publish };
