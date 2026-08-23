'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeUpgradeAnalysis,
  computeDeclineReasonBreakdown,
  computeCompetitionEdges,
  computePackageDifferential,
} = require('../../services/analytics/multipleOffers');

describe('computeUpgradeAnalysis', () => {
  test('a student who accepted their only offer counts as tookOnlyOffer, not upgraded', () => {
    const offers = [{ id: 'o1', studentId: 's1', status: 'ACCEPTED', companyId: 'c1', ctcTotalMinor: 800000 }];
    const result = computeUpgradeAnalysis(offers);
    assert.equal(result.tookOnlyOffer, 1);
    assert.equal(result.upgraded, 0);
  });

  test('accepting the higher of two offers counts as UPGRADED', () => {
    const offers = [
      { id: 'o1', studentId: 's1', status: 'ACCEPTED', companyId: 'c1', ctcTotalMinor: 900000 },
      { id: 'o2', studentId: 's1', status: 'DECLINED', companyId: 'c2', ctcTotalMinor: 700000 },
    ];
    const result = computeUpgradeAnalysis(offers);
    assert.equal(result.upgraded, 1);
    assert.equal(result.details[0].verdict, 'UPGRADED');
  });

  test('accepting the lower of two offers is flagged, not hidden', () => {
    const offers = [
      { id: 'o1', studentId: 's1', status: 'ACCEPTED', companyId: 'c1', ctcTotalMinor: 700000 },
      { id: 'o2', studentId: 's1', status: 'DECLINED', companyId: 'c2', ctcTotalMinor: 900000 },
    ];
    const result = computeUpgradeAnalysis(offers);
    assert.equal(result.tookLowerPackage, 1);
    assert.equal(result.details[0].verdict, 'TOOK_LOWER_PACKAGE');
  });

  test('a student with no accepted offer at all is skipped entirely', () => {
    const offers = [{ id: 'o1', studentId: 's1', status: 'DECLINED', companyId: 'c1', ctcTotalMinor: 700000 }];
    const result = computeUpgradeAnalysis(offers);
    assert.equal(result.studentsWithAnAcceptedOffer, 0);
  });
});

describe('computeDeclineReasonBreakdown', () => {
  test('tallies declines by reason category, defaulting to UNSPECIFIED', () => {
    const offers = [
      { status: 'DECLINED', declineReasonCategory: 'COMPENSATION' },
      { status: 'DECLINED', declineReasonCategory: 'COMPENSATION' },
      { status: 'DECLINED', declineReasonCategory: 'LOCATION' },
      { status: 'DECLINED' },
      { status: 'ACCEPTED' }, // not counted
    ];
    const result = computeDeclineReasonBreakdown(offers);
    assert.equal(result.totalDeclined, 4);
    assert.equal(result.byReason.COMPENSATION, 2);
    assert.equal(result.byReason.LOCATION, 1);
    assert.equal(result.byReason.UNSPECIFIED, 1);
  });
});

describe('computeCompetitionEdges', () => {
  test('records which company a student chose over which other company', () => {
    const offers = [
      { studentId: 's1', companyId: 'A', status: 'ACCEPTED', ctcTotalMinor: 900000 },
      { studentId: 's1', companyId: 'B', status: 'DECLINED', declineReasonCategory: 'ACCEPTED_ANOTHER_OFFER', ctcTotalMinor: 700000 },
      { studentId: 's2', companyId: 'A', status: 'ACCEPTED', ctcTotalMinor: 800000 },
      { studentId: 's2', companyId: 'B', status: 'DECLINED', declineReasonCategory: 'ACCEPTED_ANOTHER_OFFER', ctcTotalMinor: 750000 },
    ];
    const edges = computeCompetitionEdges(offers);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].lostCompanyId, 'B');
    assert.equal(edges[0].wonCompanyId, 'A');
    assert.equal(edges[0].count, 2);
  });

  test('a decline NOT attributed to another offer does not create a competition edge', () => {
    const offers = [
      { studentId: 's1', companyId: 'A', status: 'ACCEPTED', ctcTotalMinor: 900000 },
      { studentId: 's1', companyId: 'B', status: 'DECLINED', declineReasonCategory: 'LOCATION', ctcTotalMinor: 700000 },
    ];
    assert.equal(computeCompetitionEdges(offers).length, 0);
  });
});

describe('computePackageDifferential', () => {
  test('computes the spread only for students with 2+ comparable offers', () => {
    const offers = [
      { studentId: 's1', ctcTotalMinor: 900000 },
      { studentId: 's1', ctcTotalMinor: 700000 },
      { studentId: 's2', ctcTotalMinor: 800000 }, // only one offer - excluded
    ];
    const result = computePackageDifferential(offers);
    assert.equal(result.studentsWithComparableMultipleOffers, 1);
    assert.equal(result.spreadMinorStats.mean, 200000);
  });
});
