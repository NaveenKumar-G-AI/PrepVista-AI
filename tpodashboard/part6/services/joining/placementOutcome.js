'use strict';

const { OFFER_STATUSES } = require('../offers/offerStateMachine');
const { JOINING_STATUSES } = require('./joiningStateMachine');
const { PLACEMENT_OUTCOMES } = require('../../schemas/offers/types');

/**
 * Derives the normalized placement outcome for ONE offer + its joining
 * record (a student with multiple offers gets one outcome per offer -
 * section 60: never merge them). This function is intentionally narrow:
 *
 * - It only returns a TERMINAL outcome once the offer/joining state is
 *   actually terminal. A live offer (verified/published/pending) returns
 *   `{ outcome: null, reason: 'IN_PROGRESS' }` rather than guessing -
 *   "in progress" counts belong on the live dashboard (offerQueries.js),
 *   not in the placement_outcomes table.
 * - SELECTED_NOT_OFFERED / UNPLACED / HIGHER_STUDIES / ENTREPRENEURSHIP /
 *   NOT_SEEKING are NOT derivable from a single offer's state - they are
 *   season-level or student-level judgments (e.g. "this student never
 *   received any offer and the season is over", or "opted out of
 *   placements for higher studies"). Callers must supply those via
 *   `override`, which always wins and is always source: 'TPO_OVERRIDE'.
 *   This function will never invent one of those five values on its own -
 *   that is exactly the kind of decision spec section 53 reserves for a
 *   human/institutional process, not automated logic.
 *
 * @param {{offer: object|null, joining: object|null, override: {outcome: string, verifiedBy: string, verifiedAt?: string}|null}} args
 * @returns {{outcome: string|null, verified: boolean, source: 'DERIVED'|'TPO_OVERRIDE', reason?: string}}
 */
function derivePlacementOutcome({ offer, joining, override = null }) {
  if (override) {
    if (!Object.values(PLACEMENT_OUTCOMES).includes(override.outcome)) {
      throw Object.assign(new Error(`Unknown placement outcome: ${override.outcome}`), {
        code: 'UNKNOWN_PLACEMENT_OUTCOME',
      });
    }
    return {
      outcome: override.outcome,
      verified: true,
      source: 'TPO_OVERRIDE',
      verifiedBy: override.verifiedBy,
      verifiedAt: override.verifiedAt,
    };
  }

  if (!offer) {
    return { outcome: null, verified: false, source: 'DERIVED', reason: 'NO_OFFER_NO_OVERRIDE' };
  }

  if (offer.status === OFFER_STATUSES.DECLINED) {
    return { outcome: PLACEMENT_OUTCOMES.OFFER_DECLINED, verified: true, source: 'DERIVED' };
  }
  if (offer.status === OFFER_STATUSES.EXPIRED) {
    return { outcome: PLACEMENT_OUTCOMES.OFFER_EXPIRED, verified: true, source: 'DERIVED' };
  }
  if ([OFFER_STATUSES.WITHDRAWN, OFFER_STATUSES.CANCELLED].includes(offer.status)) {
    // Withdrawn/cancelled offers don't map onto a single spec outcome by
    // themselves - flag rather than guess. A TPO override should follow
    // (often SELECTED_NOT_OFFERED, if the student has no other offer).
    return { outcome: null, verified: false, source: 'DERIVED', reason: 'OFFER_WITHDRAWN_OR_CANCELLED' };
  }

  if (offer.status === OFFER_STATUSES.ACCEPTED) {
    if (!joining) {
      return { outcome: null, verified: false, source: 'DERIVED', reason: 'ACCEPTED_NO_JOINING_RECORD_YET' };
    }
    if (joining.status === JOINING_STATUSES.JOINED) {
      return { outcome: PLACEMENT_OUTCOMES.PLACED_JOINED, verified: true, source: 'DERIVED' };
    }
    if (joining.status === JOINING_STATUSES.DID_NOT_JOIN) {
      return { outcome: PLACEMENT_OUTCOMES.DID_NOT_JOIN, verified: true, source: 'DERIVED' };
    }
    // PENDING / CONFIRMED / UNVERIFIED / DELAYED
    return {
      outcome: PLACEMENT_OUTCOMES.PLACED_OFFER_ACCEPTED_JOINING_PENDING,
      verified: false,
      source: 'DERIVED',
    };
  }

  // DRAFT / RECEIVED / UNDER_VERIFICATION / VERIFIED / PUBLISHED / ACCEPTANCE_PENDING
  return { outcome: null, verified: false, source: 'DERIVED', reason: 'IN_PROGRESS' };
}

/**
 * Whether a given outcome counts toward the institution's "Verified
 * Placement" headline KPI (spec section 70: "must be configurable, do
 * not hardcode one universal policy"). Most institutions will configure
 * only PLACED_JOINED; some may also count
 * PLACED_OFFER_ACCEPTED_JOINING_PENDING as "placed" for early-season
 * reporting - that's a policy choice, not something this module decides.
 *
 * @param {string} outcome
 * @param {{verifiedPlacementOutcomes: string[]}} policy
 */
function isVerifiedPlacement(outcome, policy) {
  return Boolean(outcome) && policy.verifiedPlacementOutcomes.includes(outcome);
}

module.exports = { derivePlacementOutcome, isVerifiedPlacement };
