'use strict';

const { computeFunnel, computeOfferToJoiningFunnel } = require('./funnel');
const { getCtcDistribution } = require('./distribution');
const { OFFER_STATUSES } = require('../offers/offerStateMachine');

/** 'YYYY-MM' - simple, unambiguous, sorts correctly as a string. */
function monthBucket(dateStr) {
  return dateStr.slice(0, 7);
}

/**
 * A stable, monotonically increasing week index rather than a true
 * ISO-8601 calendar week (which has year-boundary edge cases not worth
 * the complexity here). Buckets always sort correctly and are always the
 * same width - the trade-off is the label is "W23760" rather than
 * "2026-W33"; translate to a display label at the UI layer if needed.
 */
function weekBucket(dateStr) {
  const epochDays = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 86400000);
  return `W${Math.floor(epochDays / 7)}`;
}

/**
 * @param {object[]} offers
 * @param {{bucketBy?: 'week'|'month', dateField?: string}} [opts]
 */
function computeOfferTrend(offers, { bucketBy = 'month', dateField = 'offerDate' } = {}) {
  const bucketFn = bucketBy === 'week' ? weekBucket : monthBucket;
  const buckets = new Map();

  for (const offer of offers) {
    const raw = offer[dateField];
    if (!raw) continue;
    const key = bucketFn(raw);
    if (!buckets.has(key)) buckets.set(key, { bucket: key, total: 0, accepted: 0, declined: 0 });
    const b = buckets.get(key);
    b.total += 1;
    if (offer.status === OFFER_STATUSES.ACCEPTED) b.accepted += 1;
    if (offer.status === OFFER_STATUSES.DECLINED) b.declined += 1;
  }

  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * Season-over-season comparison (spec section 46/75: "How does this
 * compare with previous season?"). Deliberately returns both seasons'
 * numbers side by side rather than a single "+12%" delta - a raw
 * percentage-point delta on top of already-computed rates can be
 * misleading (e.g. going from 2/4 to 3/6 is the same 50% rate but reads
 * as "+1 accepted" if flattened); let the caller/UI decide how to
 * present the comparison.
 */
function compareSeasons(current, prior) {
  const build = ({ offers, joiningRecords = [] }) => ({
    funnel: computeFunnel(offers),
    offerToJoining: computeOfferToJoiningFunnel(offers, joiningRecords),
    ctc: getCtcDistribution(offers.map((o) => o.ctcTotalMinor)),
  });
  return { current: build(current), prior: build(prior) };
}

module.exports = { monthBucket, weekBucket, computeOfferTrend, compareSeasons };
