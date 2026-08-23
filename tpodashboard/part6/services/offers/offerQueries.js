'use strict';

const { OFFER_STATUSES } = require('./offerStateMachine');
const { countActiveOffers } = require('./multipleOfferPolicy');

/**
 * Every function here is read-only and operates on plain arrays already
 * fetched from a repo - deliberately so a future AI tool layer (section
 * 83) can call these without touching the database directly, and so this
 * file can never "decide" placement status (section 53). Wire these to
 * your actual repo with a thin adapter, e.g.:
 *
 *   const getOffer = (id) => offerQueries.getOffer(id, await offerRepo.getById(id))
 *
 * or, more simply, expose them via a small facade that fetches first.
 */

function getOffer(offer) {
  return offer ?? null;
}

function getStudentOffers(allOffers, studentId) {
  return allOffers.filter((o) => o.studentId === studentId);
}

function getPendingOffers(allOffers) {
  return allOffers.filter((o) => o.status === OFFER_STATUSES.ACCEPTANCE_PENDING);
}

/**
 * @param {object[]} allOffers
 * @param {Date} now
 * @param {number} withinHours
 */
function getExpiringOffers(allOffers, now, withinHours = 48) {
  const cutoff = new Date(now.getTime() + withinHours * 3600 * 1000);
  return allOffers.filter(
    (o) =>
      o.status === OFFER_STATUSES.ACCEPTANCE_PENDING &&
      new Date(o.acceptanceDeadline) <= cutoff &&
      new Date(o.acceptanceDeadline) >= now
  );
}

function getOfferAcceptance(offer) {
  if (!offer) return null;
  return {
    offerId: offer.id,
    status: offer.status,
    isAccepted: offer.status === OFFER_STATUSES.ACCEPTED,
    isDeclined: offer.status === OFFER_STATUSES.DECLINED,
    isPending: offer.status === OFFER_STATUSES.ACCEPTANCE_PENDING,
  };
}

function getMultipleOfferStudents(allOffers) {
  const byStudent = new Map();
  for (const o of allOffers) {
    if (!byStudent.has(o.studentId)) byStudent.set(o.studentId, []);
    byStudent.get(o.studentId).push(o);
  }
  const result = [];
  for (const [studentId, offers] of byStudent) {
    if (countActiveOffers(offers) > 1) {
      result.push({ studentId, activeOfferCount: countActiveOffers(offers), offerIds: offers.map((o) => o.id) });
    }
  }
  return result;
}

/**
 * Basic rate/volume analytics (spec section 44). Deliberately does not
 * attribute causes ("do not infer causes automatically" - section 44).
 */
function getOfferAnalytics(allOffers) {
  const total = allOffers.length;
  const verified = allOffers.filter((o) =>
    [
      OFFER_STATUSES.VERIFIED,
      OFFER_STATUSES.PUBLISHED,
      OFFER_STATUSES.ACCEPTANCE_PENDING,
      OFFER_STATUSES.ACCEPTED,
      OFFER_STATUSES.DECLINED,
      OFFER_STATUSES.EXPIRED,
    ].includes(o.status)
  ).length;
  const accepted = allOffers.filter((o) => o.status === OFFER_STATUSES.ACCEPTED).length;
  const declined = allOffers.filter((o) => o.status === OFFER_STATUSES.DECLINED).length;
  const expired = allOffers.filter((o) => o.status === OFFER_STATUSES.EXPIRED).length;
  const pending = allOffers.filter((o) => o.status === OFFER_STATUSES.ACCEPTANCE_PENDING).length;

  return {
    total,
    verified,
    accepted,
    declined,
    expired,
    pending,
    acceptanceRate: verified > 0 ? accepted / verified : null,
    declineRate: verified > 0 ? declined / verified : null,
    expiryRate: verified > 0 ? expired / verified : null,
  };
}

/**
 * CTC stats using median/quartiles rather than mean alone, per section 48:
 * "Do not let one extreme salary distort every institutional
 * interpretation." Expects `ctcTotalMinor` values already filtered to
 * whichever population (department/batch/company) the caller wants.
 */
function getCtcAnalytics(ctcTotalMinorValues) {
  const values = [...ctcTotalMinorValues].filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, medianMinor: null, meanMinor: null, minMinor: null, maxMinor: null, p25Minor: null, p75Minor: null };
  }
  const percentile = (p) => {
    const idx = (p / 100) * (values.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return values[lo];
    return values[lo] + (values[hi] - values[lo]) * (idx - lo);
  };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    medianMinor: percentile(50),
    meanMinor: mean,
    minMinor: values[0],
    maxMinor: values[values.length - 1],
    p25Minor: percentile(25),
    p75Minor: percentile(75),
  };
}

// --- AI Insight Contract (spec section 52) ------------------------------

const INSIGHT_TYPES = Object.freeze({
  OFFER_EXPIRING: 'OFFER_EXPIRING',
  JOINING_PENDING: 'JOINING_PENDING',
  MULTIPLE_OFFERS: 'MULTIPLE_OFFERS',
});

/**
 * Builds the deterministic structured object a future natural-language AI
 * layer would narrate - this module computes the facts (hours remaining,
 * priority), the AI only ever phrases them (spec section 52/53).
 */
function buildOfferExpiringInsight(offer, now) {
  const hoursRemaining = (new Date(offer.acceptanceDeadline).getTime() - now.getTime()) / 3600000;
  const priority = hoursRemaining <= 24 ? 'HIGH' : hoursRemaining <= 48 ? 'MEDIUM' : 'LOW';
  return {
    type: INSIGHT_TYPES.OFFER_EXPIRING,
    priority,
    offer_id: offer.id,
    student_id: offer.studentId,
    evidence: { deadline: offer.acceptanceDeadline, hours_remaining: Math.round(hoursRemaining) },
    recommended_action: 'Review acceptance status',
  };
}

function buildJoiningPendingInsight(joiningRecord) {
  return {
    type: INSIGHT_TYPES.JOINING_PENDING,
    priority: 'MEDIUM',
    student_id: joiningRecord.studentId,
    offer_id: joiningRecord.offerId,
    evidence: { joining_date: joiningRecord.expectedJoiningDate },
    recommended_action: 'Verify joining confirmation',
  };
}

module.exports = {
  getOffer,
  getStudentOffers,
  getPendingOffers,
  getExpiringOffers,
  getOfferAcceptance,
  getMultipleOfferStudents,
  getOfferAnalytics,
  getCtcAnalytics,
  INSIGHT_TYPES,
  buildOfferExpiringInsight,
  buildJoiningPendingInsight,
};
