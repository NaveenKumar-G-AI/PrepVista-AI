'use strict';

const { OFFER_STATUSES } = require('../offers/offerStateMachine');
const { JOINING_STATUSES } = require('../joining/joiningStateMachine');
const { everReached, findStatusAt, diffHours } = require('./timeUtils');
const { summaryStats } = require('./statUtils');

const MAIN_LINE_STAGES = [
  OFFER_STATUSES.RECEIVED,
  OFFER_STATUSES.UNDER_VERIFICATION,
  OFFER_STATUSES.VERIFIED,
  OFFER_STATUSES.PUBLISHED,
  OFFER_STATUSES.ACCEPTANCE_PENDING,
  OFFER_STATUSES.ACCEPTED,
];

/**
 * Stage-reached counts, NOT current-status counts. An offer that is now
 * ACCEPTED also reached VERIFIED and PUBLISHED earlier - a naive
 * `offers.filter(o => o.status === 'VERIFIED').length` would miss it and
 * silently understate every upstream stage. This is exactly the kind of
 * mistake spec section 71's hostile review is aimed at ("reporting:
 * double-counting, selected vs placed confusion"), just one level down -
 * under-counting instead of double-counting, same root cause (using
 * `status` as if it were a set-membership test instead of a snapshot).
 *
 * Requires `offer.statusHistory` (see offerService.js). Falls back to
 * current-status-only for offers that don't have it, which will
 * understate upstream stages - a known, documented limitation, not a
 * silent one.
 */
function computeFunnel(offers) {
  const stageReachedCounts = {};
  for (const stage of MAIN_LINE_STAGES) {
    stageReachedCounts[stage] = offers.filter((o) => everReached(o, stage)).length;
  }

  const declined = offers.filter((o) => o.status === OFFER_STATUSES.DECLINED).length;
  const expired = offers.filter((o) => o.status === OFFER_STATUSES.EXPIRED).length;
  const withdrawn = offers.filter((o) => o.status === OFFER_STATUSES.WITHDRAWN).length;
  const cancelled = offers.filter((o) => o.status === OFFER_STATUSES.CANCELLED).length;

  const stageConversionRates = [];
  for (let i = 0; i < MAIN_LINE_STAGES.length - 1; i++) {
    const from = stageReachedCounts[MAIN_LINE_STAGES[i]];
    const to = stageReachedCounts[MAIN_LINE_STAGES[i + 1]];
    stageConversionRates.push({
      from: MAIN_LINE_STAGES[i],
      to: MAIN_LINE_STAGES[i + 1],
      rate: from > 0 ? to / from : null,
    });
  }

  const reachedAcceptancePending = stageReachedCounts[OFFER_STATUSES.ACCEPTANCE_PENDING];

  return {
    total: offers.length,
    stageReachedCounts,
    stageConversionRates,
    declined,
    expired,
    withdrawn,
    cancelled,
    // Rates are relative to offers that actually reached a decision point,
    // not to `total` - an offer still sitting in UNDER_VERIFICATION isn't
    // a "non-decline", so it shouldn't dilute the decline rate.
    acceptanceRate:
      reachedAcceptancePending > 0 ? stageReachedCounts[OFFER_STATUSES.ACCEPTED] / reachedAcceptancePending : null,
    declineRate: reachedAcceptancePending > 0 ? declined / reachedAcceptancePending : null,
    expiryRate: reachedAcceptancePending > 0 ? expired / reachedAcceptancePending : null,
  };
}

/**
 * The metric the original build was missing entirely: what fraction of
 * ACCEPTED offers actually turn into a verified JOINED outcome, and what
 * fraction don't. Arguably the single most important placement KPI
 * (spec section 44: "offer-to-joining rate") - an institution can have a
 * great acceptance rate and still lose a third of those students before
 * joining day.
 *
 * @param {object[]} offers
 * @param {object[]} joiningRecords
 */
function computeOfferToJoiningFunnel(offers, joiningRecords) {
  const joiningByOfferId = new Map(joiningRecords.map((j) => [j.offerId, j]));
  const accepted = offers.filter((o) => o.status === OFFER_STATUSES.ACCEPTED);

  const joined = accepted.filter((o) => joiningByOfferId.get(o.id)?.status === JOINING_STATUSES.JOINED);
  const didNotJoin = accepted.filter((o) => joiningByOfferId.get(o.id)?.status === JOINING_STATUSES.DID_NOT_JOIN);
  const stillPending = accepted.length - joined.length - didNotJoin.length;

  return {
    accepted: accepted.length,
    joined: joined.length,
    didNotJoin: didNotJoin.length,
    joiningPending: stillPending,
    offerToJoiningRate: accepted.length > 0 ? joined.length / accepted.length : null,
    didNotJoinRate: accepted.length > 0 ? didNotJoin.length / accepted.length : null,
  };
}

/**
 * Operational timing, not just conversion counts: how long verification
 * actually takes, and how long students take to decide. Both come
 * straight out of statusHistory - no separate event log needed.
 *
 * `timeToVerifyHours` uses the LAST time an offer reached VERIFIED,
 * because an offer can bounce UNDER_VERIFICATION -> RECEIVED -> ... ->
 * VERIFIED more than once (spec section 13's conflict loop) - the metric
 * that matters operationally is "how long did the whole verification
 * process take", not just the first attempt.
 */
function computeOfferTimingMetrics(offers) {
  const timeToVerifyHours = [];
  const timeToDecideHours = [];

  for (const offer of offers) {
    const receivedAt = findStatusAt(offer, OFFER_STATUSES.RECEIVED);
    const verifiedAt = findStatusAt(offer, OFFER_STATUSES.VERIFIED, { last: true });
    const verifyHours = diffHours(receivedAt, verifiedAt);
    if (verifyHours !== null) timeToVerifyHours.push(verifyHours);

    const publishedAt = findStatusAt(offer, OFFER_STATUSES.PUBLISHED);
    const decidedAt = findStatusAt(offer, OFFER_STATUSES.ACCEPTED) ?? findStatusAt(offer, OFFER_STATUSES.DECLINED);
    const decideHours = diffHours(publishedAt, decidedAt);
    if (decideHours !== null) timeToDecideHours.push(decideHours);
  }

  return {
    timeToVerifyHours: summaryStats(timeToVerifyHours),
    timeToDecideHours: summaryStats(timeToDecideHours),
  };
}

/** Same idea, joining side: how long from "I confirm I'll join" to TPO-verified JOINED. */
function computeJoiningTimingMetrics(joiningRecords) {
  const timeToJoinAfterConfirmHours = [];
  for (const record of joiningRecords) {
    const confirmedAt = findStatusAt(record, JOINING_STATUSES.CONFIRMED);
    const joinedAt = findStatusAt(record, JOINING_STATUSES.JOINED);
    const hours = diffHours(confirmedAt, joinedAt);
    if (hours !== null) timeToJoinAfterConfirmHours.push(hours);
  }
  return { timeToJoinAfterConfirmHours: summaryStats(timeToJoinAfterConfirmHours) };
}

module.exports = {
  MAIN_LINE_STAGES,
  computeFunnel,
  computeOfferToJoiningFunnel,
  computeOfferTimingMetrics,
  computeJoiningTimingMetrics,
};
