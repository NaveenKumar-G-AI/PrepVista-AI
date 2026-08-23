'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateNewOfferAgainstPolicy,
  evaluateAcceptance,
  countActiveOffers,
} = require('../../services/offers/multipleOfferPolicy');
const { OFFER_STATUSES } = require('../../services/offers/offerStateMachine');

function offer(id, status, companyId = 'company-x') {
  return { id, status, companyId, studentId: 'student-1' };
}

describe('multiple-offer policy engine', () => {
  test('countActiveOffers ignores terminal statuses', () => {
    const offers = [
      offer('a', OFFER_STATUSES.ACCEPTED),
      offer('b', OFFER_STATUSES.DECLINED),
      offer('c', OFFER_STATUSES.PUBLISHED),
    ];
    assert.equal(countActiveOffers(offers), 2);
  });

  test('blocks a new offer when policy disallows multiple active offers', () => {
    const policy = { allowMultipleActive: false };
    const result = evaluateNewOfferAgainstPolicy({
      policy,
      studentOffers: [offer('a', OFFER_STATUSES.PUBLISHED)],
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes('POLICY_DISALLOWS_MULTIPLE_ACTIVE_OFFERS'));
  });

  test('allows a new offer under maxActiveOffers, blocks once the cap is hit', () => {
    const policy = { allowMultipleActive: true, maxActiveOffers: 2 };
    const underCap = evaluateNewOfferAgainstPolicy({
      policy,
      studentOffers: [offer('a', OFFER_STATUSES.PUBLISHED)],
    });
    assert.equal(underCap.allowed, true);

    const atCap = evaluateNewOfferAgainstPolicy({
      policy,
      studentOffers: [offer('a', OFFER_STATUSES.PUBLISHED), offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING)],
    });
    assert.equal(atCap.allowed, false);
    assert.ok(atCap.reasons.includes('MAX_ACTIVE_OFFERS_REACHED'));
  });

  test('blocks accepting a second offer once one is already ACCEPTED (no dream-company exception)', () => {
    const policy = { allowMultipleActive: true, mustDeclinePreviousOnAccept: false };
    const result = evaluateAcceptance({
      policy,
      offerToAccept: offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING),
      studentOffers: [offer('a', OFFER_STATUSES.ACCEPTED), offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING)],
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes('STUDENT_ALREADY_HAS_ACCEPTED_OFFER'));
  });

  test('dream-company policy allows upgrading past an already-accepted offer', () => {
    const policy = {
      allowMultipleActive: true,
      dreamCompanyPolicy: { enabled: true, companyIds: ['dream-co'] },
    };
    const result = evaluateAcceptance({
      policy,
      offerToAccept: offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING, 'dream-co'),
      studentOffers: [offer('a', OFFER_STATUSES.ACCEPTED), offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING, 'dream-co')],
    });
    assert.equal(result.allowed, true);
  });

  test('mustDeclinePreviousOnAccept returns the other active offer ids to auto-decline', () => {
    const policy = { allowMultipleActive: true, mustDeclinePreviousOnAccept: true };
    const result = evaluateAcceptance({
      policy,
      offerToAccept: offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING),
      studentOffers: [offer('a', OFFER_STATUSES.PUBLISHED), offer('b', OFFER_STATUSES.ACCEPTANCE_PENDING)],
    });
    assert.equal(result.allowed, true);
    assert.deepEqual(result.declineOfferIds, ['a']);
  });
});
