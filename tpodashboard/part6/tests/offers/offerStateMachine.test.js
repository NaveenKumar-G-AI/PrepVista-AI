'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFER_STATUSES,
  canTransition,
  assertTransition,
  isTerminal,
} = require('../../services/offers/offerStateMachine');

describe('offer state machine', () => {
  test('happy path is fully legal, step by step', () => {
    const path = [
      OFFER_STATUSES.DRAFT,
      OFFER_STATUSES.RECEIVED,
      OFFER_STATUSES.UNDER_VERIFICATION,
      OFFER_STATUSES.VERIFIED,
      OFFER_STATUSES.PUBLISHED,
      OFFER_STATUSES.ACCEPTANCE_PENDING,
      OFFER_STATUSES.ACCEPTED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]} -> ${path[i + 1]}`);
    }
  });

  test('ACCEPTANCE_PENDING can decline or expire', () => {
    assert.equal(canTransition(OFFER_STATUSES.ACCEPTANCE_PENDING, OFFER_STATUSES.DECLINED), true);
    assert.equal(canTransition(OFFER_STATUSES.ACCEPTANCE_PENDING, OFFER_STATUSES.EXPIRED), true);
  });

  test('rejects skipping straight from DRAFT to PUBLISHED', () => {
    assert.equal(canTransition(OFFER_STATUSES.DRAFT, OFFER_STATUSES.PUBLISHED), false);
  });

  test('rejects moving out of a terminal status', () => {
    assert.equal(canTransition(OFFER_STATUSES.DECLINED, OFFER_STATUSES.ACCEPTED), false);
    assert.equal(canTransition(OFFER_STATUSES.EXPIRED, OFFER_STATUSES.ACCEPTANCE_PENDING), false);
  });

  test('rejects re-accepting an already-ACCEPTED offer (double-click race)', () => {
    assert.equal(canTransition(OFFER_STATUSES.ACCEPTED, OFFER_STATUSES.ACCEPTED), false);
  });

  test('assertTransition throws with a structured error on an illegal move', () => {
    assert.throws(
      () => assertTransition(OFFER_STATUSES.DRAFT, OFFER_STATUSES.ACCEPTED),
      (err) => err.code === 'ILLEGAL_OFFER_TRANSITION' && err.from === 'DRAFT' && err.to === 'ACCEPTED'
    );
  });

  test('UNDER_VERIFICATION can be sent back to RECEIVED (conflict found)', () => {
    assert.equal(canTransition(OFFER_STATUSES.UNDER_VERIFICATION, OFFER_STATUSES.RECEIVED), true);
  });

  test('isTerminal is correct for every status', () => {
    assert.equal(isTerminal(OFFER_STATUSES.DECLINED), true);
    assert.equal(isTerminal(OFFER_STATUSES.EXPIRED), true);
    assert.equal(isTerminal(OFFER_STATUSES.WITHDRAWN), true);
    assert.equal(isTerminal(OFFER_STATUSES.CANCELLED), true);
    assert.equal(isTerminal(OFFER_STATUSES.ACCEPTED), false);
    assert.equal(isTerminal(OFFER_STATUSES.DRAFT), false);
  });
});
