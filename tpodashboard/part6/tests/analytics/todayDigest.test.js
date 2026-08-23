'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeTodayDigest } = require('../../services/analytics/todayDigest');

const NOW = new Date('2026-08-15T10:00:00.000Z');

function pendingOffer(id, deadlineIso) {
  return { id, status: 'ACCEPTANCE_PENDING', acceptanceDeadline: deadlineIso };
}

describe('computeTodayDigest - offer deadlines', () => {
  test('classifies offers into today / 24h / 48h / overdue windows correctly', () => {
    const offers = [
      pendingOffer('today', '2026-08-15T18:00:00.000Z'), // 8h away, later today
      pendingOffer('tomorrow-23h', '2026-08-16T09:00:00.000Z'), // 23h away
      pendingOffer('47h', '2026-08-17T09:00:00.000Z'), // 47h away
      pendingOffer('overdue', '2026-08-14T09:00:00.000Z'), // deadline already passed
      { id: 'not-pending', status: 'VERIFIED', acceptanceDeadline: '2026-08-15T12:00:00.000Z' },
    ];

    const digest = computeTodayDigest({ offers, joiningRecords: [], now: NOW });

    assert.equal(digest.counts.expiringToday, 1);
    assert.deepEqual(digest.items.expiringToday.map((o) => o.id), ['today']);

    assert.equal(digest.counts.expiringWithin24h, 2); // 'today' + 'tomorrow-23h'
    assert.equal(digest.counts.expiringWithin48h, 3); // + '47h'
    assert.equal(digest.counts.overdueNotExpired, 1);
    assert.deepEqual(digest.items.overdueNotExpired.map((o) => o.id), ['overdue']);
  });

  test('a non-ACCEPTANCE_PENDING offer never appears in any deadline bucket, even with a near deadline', () => {
    const offers = [{ id: 'x', status: 'ACCEPTED', acceptanceDeadline: '2026-08-15T11:00:00.000Z' }];
    const digest = computeTodayDigest({ offers, joiningRecords: [], now: NOW });
    assert.equal(digest.counts.expiringToday, 0);
    assert.equal(digest.counts.expiringWithin24h, 0);
  });
});

describe('computeTodayDigest - joining windows', () => {
  test('classifies joining-today vs joining-this-week correctly', () => {
    const joiningRecords = [
      { id: 'j1', status: 'CONFIRMED', expectedJoiningDate: '2026-08-15' }, // today
      { id: 'j2', status: 'CONFIRMED', expectedJoiningDate: '2026-08-20' }, // within week
      { id: 'j3', status: 'CONFIRMED', expectedJoiningDate: '2026-08-25' }, // outside week
    ];
    const digest = computeTodayDigest({ offers: [], joiningRecords, now: NOW });
    assert.equal(digest.counts.joiningToday, 1);
    assert.equal(digest.counts.joiningThisWeek, 2);
  });

  test('counts UNVERIFIED as evidence-awaiting and DELAYED separately', () => {
    const joiningRecords = [
      { id: 'j1', status: 'UNVERIFIED' },
      { id: 'j2', status: 'UNVERIFIED' },
      { id: 'j3', status: 'DELAYED' },
      { id: 'j4', status: 'CONFIRMED' },
    ];
    const digest = computeTodayDigest({ offers: [], joiningRecords, now: NOW });
    assert.equal(digest.counts.evidenceAwaitingVerification, 2);
    assert.equal(digest.counts.delayed, 1);
  });
});

describe('computeTodayDigest - stale verification', () => {
  test('flags an offer stuck in UNDER_VERIFICATION past the threshold', () => {
    const stale = {
      id: 'stale',
      status: 'UNDER_VERIFICATION',
      statusHistory: [{ status: 'UNDER_VERIFICATION', at: '2026-08-11T06:00:00.000Z' }], // 100h before NOW
    };
    const fresh = {
      id: 'fresh',
      status: 'UNDER_VERIFICATION',
      statusHistory: [{ status: 'UNDER_VERIFICATION', at: '2026-08-15T00:00:00.000Z' }], // 10h before NOW
    };
    const digest = computeTodayDigest({ offers: [stale, fresh], joiningRecords: [], now: NOW, staleVerificationHours: 72 });
    assert.equal(digest.counts.staleInVerification, 1);
    assert.deepEqual(digest.items.staleInVerification.map((o) => o.id), ['stale']);
  });
});
