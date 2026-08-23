'use strict';

const { OFFER_STATUSES } = require('../offers/offerStateMachine');
const { summaryStats } = require('./statUtils');

function groupByStudent(offers) {
  const map = new Map();
  for (const o of offers) {
    if (!map.has(o.studentId)) map.set(o.studentId, []);
    map.get(o.studentId).push(o);
  }
  return map;
}

/**
 * For every student who accepted an offer while holding at least one
 * other offer, did they take the highest package available to them, a
 * lower one, or was it their only offer? This is the concrete version of
 * spec section 45's "accepted highest vs lower offer" - genuinely useful
 * for a TPO trying to understand whether students are optimizing for
 * package, or trading it off for something else (role, location,
 * brand) - this module only surfaces the pattern, it doesn't guess why
 * (same "no automatic cause inference" discipline as section 44).
 */
function computeUpgradeAnalysis(offers) {
  const byStudent = groupByStudent(offers);
  let upgraded = 0;
  let tookOnlyOffer = 0;
  let tookLowerPackage = 0;
  let tookEqualPackage = 0;
  const details = [];

  for (const [studentId, studentOffers] of byStudent) {
    const accepted = studentOffers.find((o) => o.status === OFFER_STATUSES.ACCEPTED);
    if (!accepted) continue;

    const others = studentOffers.filter((o) => o.id !== accepted.id);
    if (others.length === 0) {
      tookOnlyOffer += 1;
      continue;
    }

    const otherCtcValues = others.map((o) => o.ctcTotalMinor ?? 0);
    const nextBestCtc = Math.max(...otherCtcValues);
    const acceptedCtc = accepted.ctcTotalMinor ?? 0;

    let verdict;
    if (acceptedCtc > nextBestCtc) {
      upgraded += 1;
      verdict = 'UPGRADED';
    } else if (acceptedCtc < nextBestCtc) {
      tookLowerPackage += 1;
      verdict = 'TOOK_LOWER_PACKAGE';
    } else {
      tookEqualPackage += 1;
      verdict = 'EQUAL_PACKAGE';
    }
    details.push({ studentId, verdict, acceptedOfferId: accepted.id, acceptedCtcMinor: acceptedCtc, nextBestCtcMinor: nextBestCtc });
  }

  return {
    studentsWithAnAcceptedOffer: tookOnlyOffer + details.length,
    tookOnlyOffer,
    upgraded,
    tookLowerPackage,
    tookEqualPackage,
    details,
  };
}

/** Tally of why students declined, across every declined offer with a reason recorded. */
function computeDeclineReasonBreakdown(offers) {
  const declined = offers.filter((o) => o.status === OFFER_STATUSES.DECLINED);
  const byReason = {};
  for (const o of declined) {
    const key = o.declineReasonCategory ?? 'UNSPECIFIED';
    byReason[key] = (byReason[key] ?? 0) + 1;
  }
  return { totalDeclined: declined.length, byReason };
}

/**
 * "Offer competition": when a student held offers from two companies and
 * declined one specifically because they accepted the other
 * (declineReasonCategory === 'ACCEPTED_ANOTHER_OFFER'), that's a data
 * point about which company wins head-to-head. Aggregated across a
 * season this tells a TPO which companies are losing candidates to which
 * others - useful context for scheduling drives or salary conversations.
 * Purely descriptive counts of recorded decisions, not a ranking or
 * recommendation.
 */
function computeCompetitionEdges(offers) {
  const byStudent = groupByStudent(offers);
  const edgeTally = new Map(); // `${lostCompanyId}=>${wonCompanyId}` -> count

  for (const [, studentOffers] of byStudent) {
    const accepted = studentOffers.find((o) => o.status === OFFER_STATUSES.ACCEPTED);
    if (!accepted) continue;
    const lostOffers = studentOffers.filter(
      (o) => o.status === OFFER_STATUSES.DECLINED && o.declineReasonCategory === 'ACCEPTED_ANOTHER_OFFER'
    );
    for (const lost of lostOffers) {
      if (lost.companyId === accepted.companyId) continue; // guard against bad data
      const key = `${lost.companyId}=>${accepted.companyId}`;
      edgeTally.set(key, (edgeTally.get(key) ?? 0) + 1);
    }
  }

  return [...edgeTally.entries()]
    .map(([key, count]) => {
      const [lostCompanyId, wonCompanyId] = key.split('=>');
      return { lostCompanyId, wonCompanyId, count };
    })
    .sort((a, b) => b.count - a.count);
}

/** For students with 2+ offers, the spread between their highest and lowest package. */
function computePackageDifferential(offers) {
  const byStudent = groupByStudent(offers);
  const spreadsMinor = [];
  for (const [, studentOffers] of byStudent) {
    const ctcs = studentOffers.map((o) => o.ctcTotalMinor).filter((v) => typeof v === 'number' && v > 0);
    if (ctcs.length < 2) continue;
    spreadsMinor.push(Math.max(...ctcs) - Math.min(...ctcs));
  }
  return { studentsWithComparableMultipleOffers: spreadsMinor.length, spreadMinorStats: summaryStats(spreadsMinor) };
}

module.exports = {
  groupByStudent,
  computeUpgradeAnalysis,
  computeDeclineReasonBreakdown,
  computeCompetitionEdges,
  computePackageDifferential,
};
