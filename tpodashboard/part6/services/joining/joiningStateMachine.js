'use strict';

/**
 * Joining record lifecycle. Deliberately kept separate from offer status
 * (spec section 33): "accepted" is an offer fact, "joined" is a joining
 * fact, and they must stay independently auditable.
 *
 * The spec (section 31) gives the status *set* but not an explicit
 * transition diagram the way it does for offers (section 10) - the graph
 * below is this module's design decision, not lifted verbatim from the
 * spec. It encodes the three-way distinction from section 33:
 *   PENDING    -> no student action yet
 *   CONFIRMED  -> student has self-reported intent to join
 *   UNVERIFIED -> evidence/joining-date reached, awaiting TPO check
 *   JOINED     -> TPO has verified actual joining (verifiedBy/verifiedAt set)
 * Validate this against your institution's actual joining-verification
 * process before relying on it as-is.
 */

const JOINING_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  UNVERIFIED: 'UNVERIFIED',
  JOINED: 'JOINED',
  DELAYED: 'DELAYED',
  DID_NOT_JOIN: 'DID_NOT_JOIN',
  CANCELLED: 'CANCELLED',
});

const TERMINAL_STATUSES = new Set([
  JOINING_STATUSES.JOINED,
  JOINING_STATUSES.DID_NOT_JOIN,
  JOINING_STATUSES.CANCELLED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [JOINING_STATUSES.PENDING]: [
    JOINING_STATUSES.CONFIRMED,
    JOINING_STATUSES.DID_NOT_JOIN,
    JOINING_STATUSES.CANCELLED,
  ],
  [JOINING_STATUSES.CONFIRMED]: [
    JOINING_STATUSES.UNVERIFIED,
    JOINING_STATUSES.DELAYED,
    JOINING_STATUSES.DID_NOT_JOIN,
    JOINING_STATUSES.CANCELLED,
  ],
  [JOINING_STATUSES.UNVERIFIED]: [
    JOINING_STATUSES.JOINED,
    JOINING_STATUSES.DELAYED,
    JOINING_STATUSES.DID_NOT_JOIN,
    JOINING_STATUSES.CANCELLED,
  ],
  [JOINING_STATUSES.DELAYED]: [
    JOINING_STATUSES.UNVERIFIED,
    JOINING_STATUSES.JOINED,
    JOINING_STATUSES.DID_NOT_JOIN,
    JOINING_STATUSES.CANCELLED,
  ],
  [JOINING_STATUSES.JOINED]: [],
  [JOINING_STATUSES.DID_NOT_JOIN]: [],
  [JOINING_STATUSES.CANCELLED]: [],
});

function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    throw Object.assign(new Error(`Unknown joining status: ${from}`), {
      code: 'UNKNOWN_JOINING_STATUS',
    });
  }
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Illegal joining status transition: ${from} -> ${to}`), {
      code: 'ILLEGAL_JOINING_TRANSITION',
      from,
      to,
    });
  }
}

function isTerminal(status) {
  return TERMINAL_STATUSES.has(status);
}

// JOINED must always carry verification evidence - this is the line
// between "student says they joined" and "institution verified it"
// (spec section 33/38). Enforce it here so no caller can forget.
function assertJoinedHasEvidence(record) {
  if (record.status !== JOINING_STATUSES.JOINED) return;
  if (!record.verifiedBy || !record.verifiedAt) {
    throw Object.assign(
      new Error('JOINED requires verifiedBy and verifiedAt - a student cannot self-verify.'),
      { code: 'JOINED_WITHOUT_VERIFICATION' }
    );
  }
}

module.exports = {
  JOINING_STATUSES,
  ALLOWED_TRANSITIONS,
  TERMINAL_STATUSES,
  canTransition,
  assertTransition,
  isTerminal,
  assertJoinedHasEvidence,
};
