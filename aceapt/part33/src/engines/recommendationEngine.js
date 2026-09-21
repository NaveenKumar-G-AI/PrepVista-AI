'use strict';

const { daysUntil } = require('../lib/dates');

const ACTIONS = Object.freeze({
  APPLY_NOW: 'APPLY_NOW',
  PREPARE_AND_APPLY: 'PREPARE_AND_APPLY',
  PREPARE_FIRST: 'PREPARE_FIRST',
  WATCH: 'WATCH',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED',
  VERIFY_ELIGIBILITY: 'VERIFY_ELIGIBILITY',
});

function urgencyBand(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) return 'Unknown';
  if (daysRemaining < 0) return 'Expired';
  if (daysRemaining <= 3) return 'Tight';
  if (daysRemaining <= 14) return 'Moderate';
  return 'Comfortable';
}

// readinessGapBand x urgencyBand -> action (spec section 19).
// 'None' gap always applies now - there's nothing left to close.
const MATRIX = {
  None: { Tight: ACTIONS.APPLY_NOW, Moderate: ACTIONS.APPLY_NOW, Comfortable: ACTIONS.APPLY_NOW },
  Small: { Tight: ACTIONS.PREPARE_AND_APPLY, Moderate: ACTIONS.PREPARE_AND_APPLY, Comfortable: ACTIONS.PREPARE_FIRST },
  Moderate: { Tight: ACTIONS.PREPARE_AND_APPLY, Moderate: ACTIONS.PREPARE_FIRST, Comfortable: ACTIONS.PREPARE_FIRST },
  Large: { Tight: ACTIONS.PREPARE_AND_APPLY, Moderate: ACTIONS.PREPARE_FIRST, Comfortable: ACTIONS.PREPARE_FIRST },
};

function buildReasons({ eligibilityState, fitBand, gapBand, urgency, opportunityGaps }) {
  const reasons = [];
  if (eligibilityState === 'ELIGIBLE') reasons.push('You meet the stated eligibility requirements.');
  if (eligibilityState === 'LIKELY_ELIGIBLE') reasons.push('Most eligibility requirements appear met; a minor detail needs confirming.');
  reasons.push(`Overall fit is ${fitBand.toLowerCase()}, with a ${gapBand.toLowerCase()} readiness gap.`);
  if (urgency === 'Tight') reasons.push('The deadline is close, which weighs toward acting now rather than waiting.');
  if (urgency === 'Comfortable') reasons.push('The deadline is comfortably far out, which leaves room to close gaps first.');
  const topGap = opportunityGaps && opportunityGaps[0];
  if (topGap) reasons.push(`Your main gap specific to this opportunity is ${topGap.label}.`);
  return reasons;
}

/**
 * Deterministic, rule-based recommendation. This is intentionally NOT an
 * "ask the model what to recommend" function (spec section 16: "Do not make
 * this decision solely from an AI-generated opinion"). If an AI provider is
 * configured, it may only rephrase these reasons into friendlier prose -
 * see src/ai/aiProvider.js and spec section 66.
 */
function recommend({ eligibility, overallFit, readinessGapBand, deadlineIso, gaps }) {
  const daysRemaining = daysUntil(deadlineIso, new Date().toISOString());
  const urgency = urgencyBand(daysRemaining);

  if (eligibility.state === 'NOT_ELIGIBLE') {
    return { action: ACTIONS.NOT_RECOMMENDED, confidence: 'HIGH', reasons: eligibility.reasons, daysRemaining, urgency };
  }
  if (eligibility.state === 'UNCERTAIN') {
    return {
      action: ACTIONS.VERIFY_ELIGIBILITY,
      confidence: 'MEDIUM',
      reasons: ["We can't confirm you meet the stated eligibility yet.", ...eligibility.reasons],
      daysRemaining,
      urgency,
    };
  }
  if (urgency === 'Expired') {
    return { action: ACTIONS.NOT_RECOMMENDED, confidence: 'HIGH', reasons: ["This opportunity's deadline has passed."], daysRemaining, urgency };
  }

  const fitBand = overallFit.band;
  if (fitBand === 'Weak' || fitBand === 'Unknown') {
    return {
      action: ACTIONS.WATCH,
      confidence: fitBand === 'Unknown' ? 'LOW' : 'MEDIUM',
      reasons: fitBand === 'Unknown'
        ? ["There isn't enough structured information yet to confidently assess fit."]
        : ['This opportunity currently sits well outside your target and capability profile.', 'Its requirements are quite different from where your preparation has focused so far.'],
      daysRemaining,
      urgency,
    };
  }

  const gapBand = readinessGapBand === 'Unknown' ? 'Large' : readinessGapBand;
  const urgencyKey = ['Tight', 'Moderate', 'Comfortable'].includes(urgency) ? urgency : 'Moderate';
  const action = MATRIX[gapBand][urgencyKey];

  const reasons = buildReasons({ eligibilityState: eligibility.state, fitBand, gapBand, urgency, opportunityGaps: gaps ? gaps.opportunityGaps : [] });
  if (gapBand === 'Large' && urgencyKey === 'Tight') {
    reasons.push("Applying is still reasonable, but this is a real stretch - expect the biggest risk at the stage tied to your weakest gap. We won't guarantee an outcome either way.");
  }

  return { action, confidence: fitBand === 'Unknown' ? 'LOW' : 'MEDIUM', reasons, daysRemaining, urgency };
}

module.exports = { ACTIONS, recommend, urgencyBand };
