'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { monthBucket, weekBucket, computeOfferTrend, compareSeasons } = require('../../services/analytics/trends');

describe('bucket functions', () => {
  test('monthBucket groups by calendar month', () => {
    assert.equal(monthBucket('2026-08-05'), '2026-08');
    assert.equal(monthBucket('2026-08-31'), '2026-08');
    assert.equal(monthBucket('2026-09-01'), '2026-09');
  });

  test('weekBucket advances by exactly 2 when dates are 14 days apart (always, regardless of alignment)', () => {
    const w1 = weekBucket('2026-08-01');
    const w2 = weekBucket('2026-08-15'); // exactly 14 days later
    const index1 = Number(w1.slice(1));
    const index2 = Number(w2.slice(1));
    assert.equal(index2 - index1, 2);
  });
});

describe('computeOfferTrend', () => {
  test('buckets offers by month and tracks accepted/declined within each bucket, sorted chronologically', () => {
    const offers = [
      { status: 'ACCEPTED', offerDate: '2026-07-15' },
      { status: 'DECLINED', offerDate: '2026-07-20' },
      { status: 'ACCEPTED', offerDate: '2026-08-01' },
      { status: 'PUBLISHED', offerDate: '2026-08-10' },
    ];
    const trend = computeOfferTrend(offers, { bucketBy: 'month' });
    assert.equal(trend.length, 2);
    assert.equal(trend[0].bucket, '2026-07');
    assert.equal(trend[0].total, 2);
    assert.equal(trend[0].accepted, 1);
    assert.equal(trend[0].declined, 1);
    assert.equal(trend[1].bucket, '2026-08');
    assert.equal(trend[1].total, 2);
    assert.equal(trend[1].accepted, 1);
  });

  test('an offer missing the bucketing date field is skipped, not crashed on', () => {
    const offers = [{ status: 'ACCEPTED' /* no offerDate */ }];
    assert.doesNotThrow(() => computeOfferTrend(offers));
    assert.equal(computeOfferTrend(offers).length, 0);
  });
});

describe('compareSeasons', () => {
  test('returns current and prior computed independently, side by side', () => {
    const current = { offers: [{ status: 'ACCEPTED', statusHistory: [{ status: 'ACCEPTANCE_PENDING', at: '2026-08-01T00:00:00Z' }, { status: 'ACCEPTED', at: '2026-08-02T00:00:00Z' }], ctcTotalMinor: 900000 }] };
    const prior = { offers: [{ status: 'DECLINED', statusHistory: [{ status: 'ACCEPTANCE_PENDING', at: '2025-08-01T00:00:00Z' }, { status: 'DECLINED', at: '2025-08-02T00:00:00Z' }], ctcTotalMinor: 700000 }] };

    const result = compareSeasons(current, prior);
    assert.equal(result.current.funnel.total, 1);
    assert.equal(result.prior.funnel.total, 1);
    assert.equal(result.current.funnel.declined, 0);
    assert.equal(result.prior.funnel.declined, 1);
  });
});
