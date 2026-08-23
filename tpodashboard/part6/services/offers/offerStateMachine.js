'use strict';

/**
 * Offer status lifecycle. This is the single source of truth for which
 * status changes are legal - nothing outside this file should ever set
 * `offer.status` directly. See PART6 spec section 10.
 */

const OFFER_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  RECEIVED: 'RECEIVED',
  UNDER_VERIFICATION: 'UNDER_VERIFICATION',
  VERIFIED: 'VERIFIED',
  PUBLISHED: 'PUBLISHED',
  ACCEPTANCE_PENDING: 'ACCEPTANCE_PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  CANCELLED: 'CANCELLED',
});

// No further OFFER-status transitions happen after these except via the
// explicit correction path (offerService.correctOffer), which is audited
// separately and does not go through assertTransition.
const TERMINAL_STATUSES = new Set([
  OFFER_STATUSES.DECLINED,
  OFFER_STATUSES.EXPIRED,
  OFFER_STATUSES.WITHDRAWN,
  OFFER_STATUSES.CANCELLED,
]);

/**
 * Explicit allow-list. Anything not listed here is illegal, including
 * "obvious" shortcuts like DRAFT -> PUBLISHED or ACCEPTED -> DECLINED.
 * Keeping this as a flat map (rather than scattered `if` checks in the
 * service layer) is what makes "every transition validated and audited"
 * (spec section 10) actually enforceable in one place.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [OFFER_STATUSES.DRAFT]: [OFFER_STATUSES.RECEIVED, OFFER_STATUSES.CANCELLED],
  [OFFER_STATUSES.RECEIVED]: [OFFER_STATUSES.UNDER_VERIFICATION, OFFER_STATUSES.CANCELLED],
  // UNDER_VERIFICATION -> RECEIVED covers "offer conflict detected, sent
  // back for correction" (spec section 13/16) rather than silently
  // resolving the conflict in place.
  [OFFER_STATUSES.UNDER_VERIFICATION]: [
    OFFER_STATUSES.VERIFIED,
    OFFER_STATUSES.RECEIVED,
    OFFER_STATUSES.CANCELLED,
  ],
  [OFFER_STATUSES.VERIFIED]: [
    OFFER_STATUSES.PUBLISHED,
    OFFER_STATUSES.WITHDRAWN,
    OFFER_STATUSES.CANCELLED,
  ],
  [OFFER_STATUSES.PUBLISHED]: [
    OFFER_STATUSES.ACCEPTANCE_PENDING,
    OFFER_STATUSES.WITHDRAWN,
    OFFER_STATUSES.CANCELLED,
  ],
  [OFFER_STATUSES.ACCEPTANCE_PENDING]: [
    OFFER_STATUSES.ACCEPTED,
    OFFER_STATUSES.DECLINED,
    OFFER_STATUSES.EXPIRED,
    OFFER_STATUSES.WITHDRAWN,
  ],
  // Rare, administrative-only: company rescinds after acceptance, or the
  // institution cancels the record outright. Both require override +
  // audit reason in the service layer, not just a plain transition.
  [OFFER_STATUSES.ACCEPTED]: [OFFER_STATUSES.WITHDRAWN, OFFER_STATUSES.CANCELLED],
  [OFFER_STATUSES.DECLINED]: [],
  [OFFER_STATUSES.EXPIRED]: [],
  [OFFER_STATUSES.WITHDRAWN]: [],
  [OFFER_STATUSES.CANCELLED]: [],
});

function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    throw Object.assign(new Error(`Unknown offer status: ${from}`), {
      code: 'UNKNOWN_OFFER_STATUS',
    });
  }
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Illegal offer status transition: ${from} -> ${to}`), {
      code: 'ILLEGAL_OFFER_TRANSITION',
      from,
      to,
    });
  }
}

function isTerminal(status) {
  return TERMINAL_STATUSES.has(status);
}

module.exports = {
  OFFER_STATUSES,
  ALLOWED_TRANSITIONS,
  TERMINAL_STATUSES,
  canTransition,
  assertTransition,
  isTerminal,
};
