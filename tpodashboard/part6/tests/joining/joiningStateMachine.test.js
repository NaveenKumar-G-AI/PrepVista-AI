'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  JOINING_STATUSES,
  canTransition,
  assertJoinedHasEvidence,
} = require('../../services/joining/joiningStateMachine');

describe('joining state machine', () => {
  test('happy path PENDING -> CONFIRMED -> UNVERIFIED -> JOINED', () => {
    assert.equal(canTransition(JOINING_STATUSES.PENDING, JOINING_STATUSES.CONFIRMED), true);
    assert.equal(canTransition(JOINING_STATUSES.CONFIRMED, JOINING_STATUSES.UNVERIFIED), true);
    assert.equal(canTransition(JOINING_STATUSES.UNVERIFIED, JOINING_STATUSES.JOINED), true);
  });

  test('a student cannot self-report all the way to JOINED', () => {
    assert.equal(canTransition(JOINING_STATUSES.PENDING, JOINING_STATUSES.JOINED), false);
    assert.equal(canTransition(JOINING_STATUSES.CONFIRMED, JOINING_STATUSES.JOINED), false);
  });

  test('DELAYED can still resolve to JOINED or DID_NOT_JOIN', () => {
    assert.equal(canTransition(JOINING_STATUSES.DELAYED, JOINING_STATUSES.JOINED), true);
    assert.equal(canTransition(JOINING_STATUSES.DELAYED, JOINING_STATUSES.DID_NOT_JOIN), true);
  });

  test('JOINED is terminal - no further transitions', () => {
    assert.equal(canTransition(JOINING_STATUSES.JOINED, JOINING_STATUSES.DELAYED), false);
  });

  test('assertJoinedHasEvidence rejects JOINED without verifiedBy/verifiedAt', () => {
    assert.throws(
      () => assertJoinedHasEvidence({ status: JOINING_STATUSES.JOINED }),
      (err) => err.code === 'JOINED_WITHOUT_VERIFICATION'
    );
  });

  test('assertJoinedHasEvidence passes when both fields are present', () => {
    assert.doesNotThrow(() =>
      assertJoinedHasEvidence({
        status: JOINING_STATUSES.JOINED,
        verifiedBy: 'tpo-1',
        verifiedAt: '2026-09-01T00:00:00.000Z',
      })
    );
  });

  test('assertJoinedHasEvidence is a no-op for non-JOINED statuses', () => {
    assert.doesNotThrow(() => assertJoinedHasEvidence({ status: JOINING_STATUSES.CONFIRMED }));
  });
});
