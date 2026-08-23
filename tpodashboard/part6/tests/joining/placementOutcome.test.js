'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { derivePlacementOutcome, isVerifiedPlacement } = require('../../services/joining/placementOutcome');
const { PLACEMENT_OUTCOMES } = require('../../schemas/offers/types');

describe('placement outcome derivation', () => {
  test('ACCEPTED + JOINED -> PLACED_JOINED, verified', () => {
    const result = derivePlacementOutcome({
      offer: { status: 'ACCEPTED' },
      joining: { status: 'JOINED' },
    });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.PLACED_JOINED);
    assert.equal(result.verified, true);
  });

  test('ACCEPTED + joining still pending -> PLACED_OFFER_ACCEPTED_JOINING_PENDING, not verified', () => {
    const result = derivePlacementOutcome({
      offer: { status: 'ACCEPTED' },
      joining: { status: 'CONFIRMED' },
    });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.PLACED_OFFER_ACCEPTED_JOINING_PENDING);
    assert.equal(result.verified, false);
  });

  test('ACCEPTED + DID_NOT_JOIN -> DID_NOT_JOIN', () => {
    const result = derivePlacementOutcome({
      offer: { status: 'ACCEPTED' },
      joining: { status: 'DID_NOT_JOIN' },
    });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.DID_NOT_JOIN);
  });

  test('DECLINED offer -> OFFER_DECLINED', () => {
    const result = derivePlacementOutcome({ offer: { status: 'DECLINED' }, joining: null });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.OFFER_DECLINED);
  });

  test('EXPIRED offer -> OFFER_EXPIRED', () => {
    const result = derivePlacementOutcome({ offer: { status: 'EXPIRED' }, joining: null });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.OFFER_EXPIRED);
  });

  test('a still-live offer (e.g. PUBLISHED) has no outcome yet - never guesses', () => {
    const result = derivePlacementOutcome({ offer: { status: 'PUBLISHED' }, joining: null });
    assert.equal(result.outcome, null);
    assert.equal(result.reason, 'IN_PROGRESS');
  });

  test('no offer and no override -> null, not UNPLACED (that is a human judgment)', () => {
    const result = derivePlacementOutcome({ offer: null, joining: null });
    assert.equal(result.outcome, null);
  });

  test('an explicit TPO override always wins and is always marked verified', () => {
    const result = derivePlacementOutcome({
      offer: { status: 'PUBLISHED' }, // would otherwise be IN_PROGRESS
      joining: null,
      override: { outcome: PLACEMENT_OUTCOMES.HIGHER_STUDIES, verifiedBy: 'tpo-1' },
    });
    assert.equal(result.outcome, PLACEMENT_OUTCOMES.HIGHER_STUDIES);
    assert.equal(result.source, 'TPO_OVERRIDE');
    assert.equal(result.verified, true);
  });

  test('override rejects an unknown outcome value', () => {
    assert.throws(
      () =>
        derivePlacementOutcome({
          offer: null,
          joining: null,
          override: { outcome: 'NOT_A_REAL_OUTCOME', verifiedBy: 'tpo-1' },
        }),
      (err) => err.code === 'UNKNOWN_PLACEMENT_OUTCOME'
    );
  });
});

describe('isVerifiedPlacement KPI mapping', () => {
  test('only counts outcomes the institution configured', () => {
    const policy = { verifiedPlacementOutcomes: [PLACEMENT_OUTCOMES.PLACED_JOINED] };
    assert.equal(isVerifiedPlacement(PLACEMENT_OUTCOMES.PLACED_JOINED, policy), true);
    assert.equal(isVerifiedPlacement(PLACEMENT_OUTCOMES.PLACED_OFFER_ACCEPTED_JOINING_PENDING, policy), false);
  });

  test('an institution may choose to also count accepted-but-pending as placed', () => {
    const policy = {
      verifiedPlacementOutcomes: [
        PLACEMENT_OUTCOMES.PLACED_JOINED,
        PLACEMENT_OUTCOMES.PLACED_OFFER_ACCEPTED_JOINING_PENDING,
      ],
    };
    assert.equal(isVerifiedPlacement(PLACEMENT_OUTCOMES.PLACED_OFFER_ACCEPTED_JOINING_PENDING, policy), true);
  });

  test('a null outcome never counts', () => {
    const policy = { verifiedPlacementOutcomes: [PLACEMENT_OUTCOMES.PLACED_JOINED] };
    assert.equal(isVerifiedPlacement(null, policy), false);
  });
});
