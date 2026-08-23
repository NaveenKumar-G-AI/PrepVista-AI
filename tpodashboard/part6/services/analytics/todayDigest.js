'use strict';

const { OFFER_STATUSES } = require('../offers/offerStateMachine');
const { JOINING_STATUSES } = require('../joining/joiningStateMachine');
const { findStatusAt } = require('./timeUtils');

function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function hoursUntil(deadlineIso, now) {
  return (new Date(deadlineIso).getTime() - now.getTime()) / 3600000;
}

/**
 * The concrete answer to spec section 39's "What requires action today?"
 * and the section 42/43 workbenches, computed together rather than as
 * separate queries - a TPO's morning triage is one screen, not five.
 * Every list here is small enough to act on directly (spec section 41:
 * "make urgent records visually obvious").
 *
 * @param {{offers: object[], joiningRecords: object[], now: Date, staleVerificationHours?: number}} args
 */
function computeTodayDigest({ offers, joiningRecords, now, staleVerificationHours = 72 }) {
  const todayStart = startOfUtcDay(now);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const pendingOffers = offers.filter((o) => o.status === OFFER_STATUSES.ACCEPTANCE_PENDING);

  const expiringToday = pendingOffers.filter((o) => {
    const d = new Date(o.acceptanceDeadline);
    return d >= now && d < todayEnd;
  });
  const expiringWithin24h = pendingOffers.filter((o) => {
    const h = hoursUntil(o.acceptanceDeadline, now);
    return h >= 0 && h <= 24;
  });
  const expiringWithin48h = pendingOffers.filter((o) => {
    const h = hoursUntil(o.acceptanceDeadline, now);
    return h >= 0 && h <= 48;
  });
  // Deadline has passed but the offer hasn't been transitioned to EXPIRED -
  // only meaningful when the institution's policy is manual expiry
  // (policy/institutionPolicy.example.json: acceptanceDeadline.autoExpireOnDeadline).
  const overdueNotExpired = pendingOffers.filter((o) => new Date(o.acceptanceDeadline) < now);

  const joiningToday = joiningRecords.filter((j) => {
    if (!j.expectedJoiningDate) return false;
    const d = new Date(`${j.expectedJoiningDate}T00:00:00.000Z`);
    return d >= todayStart && d < todayEnd;
  });
  const joiningThisWeek = joiningRecords.filter((j) => {
    if (!j.expectedJoiningDate) return false;
    const d = new Date(`${j.expectedJoiningDate}T00:00:00.000Z`);
    return d >= todayStart && d < weekEnd;
  });
  const evidenceAwaitingVerification = joiningRecords.filter((j) => j.status === JOINING_STATUSES.UNVERIFIED);
  const delayed = joiningRecords.filter((j) => j.status === JOINING_STATUSES.DELAYED);

  // Offers stuck in UNDER_VERIFICATION too long - a data-quality /
  // operational-health signal, not a placement-outcome one.
  const staleInVerification = offers.filter((o) => {
    if (o.status !== OFFER_STATUSES.UNDER_VERIFICATION) return false;
    const enteredAt = findStatusAt(o, OFFER_STATUSES.UNDER_VERIFICATION, { last: true });
    if (!enteredAt) return false;
    return (now.getTime() - new Date(enteredAt).getTime()) / 3600000 > staleVerificationHours;
  });

  return {
    generatedAt: now.toISOString(),
    counts: {
      expiringToday: expiringToday.length,
      expiringWithin24h: expiringWithin24h.length,
      expiringWithin48h: expiringWithin48h.length,
      overdueNotExpired: overdueNotExpired.length,
      joiningToday: joiningToday.length,
      joiningThisWeek: joiningThisWeek.length,
      evidenceAwaitingVerification: evidenceAwaitingVerification.length,
      delayed: delayed.length,
      staleInVerification: staleInVerification.length,
    },
    items: {
      expiringToday,
      expiringWithin24h,
      expiringWithin48h,
      overdueNotExpired,
      joiningToday,
      joiningThisWeek,
      evidenceAwaitingVerification,
      delayed,
      staleInVerification,
    },
  };
}

module.exports = { computeTodayDigest };
