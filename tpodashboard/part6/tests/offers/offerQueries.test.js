'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  getStudentOffers,
  getPendingOffers,
  getExpiringOffers,
  getOfferAcceptance,
  getMultipleOfferStudents,
  getOfferAnalytics,
  getCtcAnalytics,
  buildOfferExpiringInsight,
  buildJoiningPendingInsight,
} = require('../../services/offers/offerQueries');

function offer(id, studentId, status, extra = {}) {
  return { id, studentId, status, ...extra };
}

describe('basic read helpers', () => {
  test('getStudentOffers filters to one student', () => {
    const offers = [offer('o1', 's1', 'ACCEPTED'), offer('o2', 's2', 'ACCEPTED'), offer('o3', 's1', 'DECLINED')];
    assert.deepEqual(getStudentOffers(offers, 's1').map((o) => o.id), ['o1', 'o3']);
  });

  test('getPendingOffers returns only ACCEPTANCE_PENDING', () => {
    const offers = [offer('o1', 's1', 'ACCEPTANCE_PENDING'), offer('o2', 's1', 'ACCEPTED')];
    assert.equal(getPendingOffers(offers).length, 1);
  });

  test('getExpiringOffers respects the window and excludes already-past deadlines', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    const offers = [
      offer('within', 's1', 'ACCEPTANCE_PENDING', { acceptanceDeadline: '2026-08-16T00:00:00.000Z' }), // 24h
      offer('outside', 's1', 'ACCEPTANCE_PENDING', { acceptanceDeadline: '2026-08-20T00:00:00.000Z' }),
      offer('past', 's1', 'ACCEPTANCE_PENDING', { acceptanceDeadline: '2026-08-14T00:00:00.000Z' }),
      offer('wrong-status', 's1', 'VERIFIED', { acceptanceDeadline: '2026-08-16T00:00:00.000Z' }),
    ];
    const expiring = getExpiringOffers(offers, now, 48);
    assert.deepEqual(expiring.map((o) => o.id), ['within']);
  });

  test('getOfferAcceptance summarizes status as booleans, and null for a missing offer', () => {
    assert.equal(getOfferAcceptance(null), null);
    const result = getOfferAcceptance(offer('o1', 's1', 'ACCEPTED'));
    assert.equal(result.isAccepted, true);
    assert.equal(result.isDeclined, false);
  });

  test('getMultipleOfferStudents only returns students with 2+ ACTIVE offers', () => {
    const offers = [
      offer('o1', 's1', 'PUBLISHED'),
      offer('o2', 's1', 'ACCEPTANCE_PENDING'),
      offer('o3', 's2', 'PUBLISHED'),
      offer('o4', 's2', 'DECLINED'), // terminal, doesn't count
    ];
    const result = getMultipleOfferStudents(offers);
    assert.equal(result.length, 1);
    assert.equal(result[0].studentId, 's1');
  });
});

describe('getOfferAnalytics', () => {
  test('computes rates relative to verified-or-beyond offers, not total', () => {
    const offers = [
      offer('o1', 's1', 'ACCEPTED'),
      offer('o2', 's2', 'DECLINED'),
      offer('o3', 's3', 'DRAFT'), // not yet verified - excluded from the denominator
    ];
    const result = getOfferAnalytics(offers);
    assert.equal(result.total, 3);
    assert.equal(result.verified, 2);
    assert.equal(result.acceptanceRate, 0.5);
  });

  test('rates are null, not NaN, when nothing has been verified yet', () => {
    const result = getOfferAnalytics([offer('o1', 's1', 'DRAFT')]);
    assert.equal(result.acceptanceRate, null);
  });
});

describe('getCtcAnalytics', () => {
  test('ignores non-numeric entries and computes percentiles', () => {
    const result = getCtcAnalytics([800000, 900000, null, 700000, undefined]);
    assert.equal(result.count, 3);
    assert.equal(result.medianMinor, 800000);
  });
});

describe('AI insight builders', () => {
  test('buildOfferExpiringInsight computes hours_remaining and escalates priority near the deadline', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');
    const soon = buildOfferExpiringInsight(offer('o1', 's1', 'ACCEPTANCE_PENDING', { acceptanceDeadline: '2026-08-15T10:00:00.000Z' }), now);
    assert.equal(soon.priority, 'HIGH');
    assert.equal(soon.evidence.hours_remaining, 10);

    const later = buildOfferExpiringInsight(offer('o2', 's1', 'ACCEPTANCE_PENDING', { acceptanceDeadline: '2026-08-19T00:00:00.000Z' }), now);
    assert.equal(later.priority, 'LOW');
  });

  test('buildJoiningPendingInsight carries the joining date as evidence', () => {
    const insight = buildJoiningPendingInsight({ studentId: 's1', offerId: 'o1', expectedJoiningDate: '2026-09-01' });
    assert.equal(insight.type, 'JOINING_PENDING');
    assert.equal(insight.evidence.joining_date, '2026-09-01');
  });
});
