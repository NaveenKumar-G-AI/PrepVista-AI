'use strict';

const { OFFER_STATUSES } = require('./offerStateMachine');

/**
 * @typedef {Object} MultipleOfferPolicy
 * @property {boolean} allowMultipleActive        - may a student hold >1 non-terminal offer at once
 * @property {number=} maxActiveOffers             - cap on simultaneous non-terminal offers (omit = unlimited)
 * @property {boolean} mustDeclinePreviousOnAccept  - accepting a new offer auto-declines other active ones
 * @property {boolean} restrictApplicationsAfterAccepted - block new drives once an offer is accepted
 * @property {{enabled: boolean, companyIds: string[]}=} dreamCompanyPolicy
 *   - if enabled, offers from listed companies are exempt from
 *     restrictApplicationsAfterAccepted (a "dream company" upgrade path)
 */

const ACTIVE_OFFER_STATUSES = new Set([
  OFFER_STATUSES.VERIFIED,
  OFFER_STATUSES.PUBLISHED,
  OFFER_STATUSES.ACCEPTANCE_PENDING,
  OFFER_STATUSES.ACCEPTED,
]);

function countActiveOffers(offers) {
  return offers.filter((o) => ACTIVE_OFFER_STATUSES.has(o.status)).length;
}

/**
 * Called when publishing a new offer to a student, BEFORE it becomes
 * visible to them - lets the TPO workbench flag a policy breach up
 * front instead of discovering it after the student has already seen it.
 *
 * @param {{policy: MultipleOfferPolicy, studentOffers: object[]}} args
 * @returns {{allowed: boolean, reasons: string[]}}
 */
function evaluateNewOfferAgainstPolicy({ policy, studentOffers }) {
  const reasons = [];
  const activeCount = countActiveOffers(studentOffers);

  if (!policy.allowMultipleActive && activeCount >= 1) {
    reasons.push('POLICY_DISALLOWS_MULTIPLE_ACTIVE_OFFERS');
  }
  if (typeof policy.maxActiveOffers === 'number' && activeCount >= policy.maxActiveOffers) {
    reasons.push('MAX_ACTIVE_OFFERS_REACHED');
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Called when a student accepts a specific offer. Decides whether the
 * acceptance is allowed under policy, and what side effects (e.g. forced
 * declines of other active offers) it triggers. Returning the side
 * effects instead of applying them lets the caller (offerService) run
 * them inside the same transaction/audit entry.
 *
 * @param {{policy: MultipleOfferPolicy, offerToAccept: object, studentOffers: object[]}} args
 * @returns {{allowed: boolean, reasons: string[], declineOfferIds: string[]}}
 */
function evaluateAcceptance({ policy, offerToAccept, studentOffers }) {
  const reasons = [];
  const otherActive = studentOffers.filter(
    (o) => o.id !== offerToAccept.id && ACTIVE_OFFER_STATUSES.has(o.status)
  );
  const alreadyAccepted = studentOffers.some(
    (o) => o.id !== offerToAccept.id && o.status === OFFER_STATUSES.ACCEPTED
  );

  const isDreamCompanyUpgrade =
    policy.dreamCompanyPolicy?.enabled &&
    policy.dreamCompanyPolicy.companyIds.includes(offerToAccept.companyId);

  if (alreadyAccepted && !isDreamCompanyUpgrade) {
    reasons.push('STUDENT_ALREADY_HAS_ACCEPTED_OFFER');
  }

  const declineOfferIds =
    reasons.length === 0 && policy.mustDeclinePreviousOnAccept
      ? otherActive.map((o) => o.id)
      : [];

  return { allowed: reasons.length === 0, reasons, declineOfferIds };
}

/**
 * Should a new application/drive entry be blocked because the student
 * already holds an accepted offer? Section 29's "application restrictions
 * after accepted offer", with the dream-company escape hatch.
 */
function evaluateApplicationRestriction({ policy, studentOffers, targetCompanyId }) {
  if (!policy.restrictApplicationsAfterAccepted) return { restricted: false };

  const accepted = studentOffers.filter((o) => o.status === OFFER_STATUSES.ACCEPTED);
  if (accepted.length === 0) return { restricted: false };

  const dreamException =
    policy.dreamCompanyPolicy?.enabled &&
    policy.dreamCompanyPolicy.companyIds.includes(targetCompanyId);

  return { restricted: !dreamException, reason: dreamException ? null : 'HAS_ACCEPTED_OFFER' };
}

module.exports = {
  ACTIVE_OFFER_STATUSES,
  countActiveOffers,
  evaluateNewOfferAgainstPolicy,
  evaluateAcceptance,
  evaluateApplicationRestriction,
};
