'use strict';

/**
 * Extends the base insight contract in services/offers/offerQueries.js
 * (OFFER_EXPIRING, JOINING_PENDING) with the insight types the deeper
 * analytics in this folder make possible. Same discipline as before
 * (spec section 53: "AI must not decide placement status") - every
 * builder here computes a fact and a priority; none of them assert a
 * cause or make a status decision. `buildSegmentDeviationInsight` in
 * particular is worded to flag a gap, not explain it (section 44: "do
 * not infer causes automatically").
 */

const ADVANCED_INSIGHT_TYPES = Object.freeze({
  MULTIPLE_OFFERS: 'MULTIPLE_OFFERS',
  STALE_VERIFICATION: 'STALE_VERIFICATION',
  SEGMENT_DEVIATION: 'SEGMENT_DEVIATION',
});

function buildMultipleOffersInsight(studentId, activeOffers) {
  const deadlines = activeOffers.map((o) => o.acceptanceDeadline).filter(Boolean).sort();
  return {
    type: ADVANCED_INSIGHT_TYPES.MULTIPLE_OFFERS,
    priority: activeOffers.length >= 3 ? 'HIGH' : 'MEDIUM',
    student_id: studentId,
    evidence: {
      active_offer_count: activeOffers.length,
      offer_ids: activeOffers.map((o) => o.id),
      earliest_deadline: deadlines[0] ?? null,
    },
    recommended_action: 'Review with student to understand decision timeline',
  };
}

function buildStaleVerificationInsight(offer, enteredVerificationAtIso, now) {
  const hoursStuck = (now.getTime() - new Date(enteredVerificationAtIso).getTime()) / 3600000;
  return {
    type: ADVANCED_INSIGHT_TYPES.STALE_VERIFICATION,
    priority: hoursStuck > 120 ? 'HIGH' : 'MEDIUM',
    offer_id: offer.id,
    evidence: { hours_in_verification: Math.round(hoursStuck) },
    recommended_action: 'Review verification queue',
  };
}

/**
 * Flags that one segment's rate (e.g. a department's acceptance rate, a
 * company's decline rate) sits notably away from the overall benchmark.
 * `recommended_action` is deliberately generic - this object states a
 * measured gap, never a diagnosis.
 */
function buildSegmentDeviationInsight({ dimensionLabel, dimensionValue, metricName, rate, benchmarkRate }) {
  const deviation = rate - benchmarkRate;
  return {
    type: ADVANCED_INSIGHT_TYPES.SEGMENT_DEVIATION,
    priority: Math.abs(deviation) >= 0.2 ? 'HIGH' : 'MEDIUM',
    evidence: {
      dimension: dimensionLabel,
      value: dimensionValue,
      metric: metricName,
      rate,
      benchmark_rate: benchmarkRate,
      deviation,
    },
    recommended_action: 'Review with placement team - deviation noted, cause not inferred',
  };
}

module.exports = {
  ADVANCED_INSIGHT_TYPES,
  buildMultipleOffersInsight,
  buildStaleVerificationInsight,
  buildSegmentDeviationInsight,
};
