'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildSeasonReport, companyScorecardToCsvRows, toCsvString } = require('../../services/analytics/report');

function makeOffer(id, studentId, companyId, roleTitle, finalStatus, ctcTotalMinor, declineReasonCategory) {
  const fullPath = ['DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED', 'PUBLISHED', 'ACCEPTANCE_PENDING', finalStatus];
  const path = finalStatus === 'VERIFIED' ? ['DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED'] : fullPath;
  return {
    id,
    studentId,
    companyId,
    roleTitle,
    status: finalStatus,
    ctcTotalMinor,
    declineReasonCategory,
    statusHistory: path.map((status, i) => ({ status, at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })),
  };
}

function buildFixture() {
  const offers = [
    makeOffer('o1', 's1', 'A', 'SDE', 'ACCEPTED', 900000),
    makeOffer('o2', 's2', 'A', 'SDE', 'ACCEPTED', 850000),
    makeOffer('o3', 's3', 'B', 'Analyst', 'DECLINED', 700000),
    makeOffer('o4', 's4', 'B', 'Analyst', 'ACCEPTED', 750000),
    makeOffer('o5', 's5', 'C', 'SDE', 'VERIFIED', 800000),
  ];
  const joiningRecords = [
    { offerId: 'o1', status: 'JOINED' },
    { offerId: 'o2', status: 'DID_NOT_JOIN' },
    { offerId: 'o4', status: 'JOINED' },
  ];
  const departmentByStudentId = { s1: 'CSE', s2: 'CSE', s3: 'ECE', s4: 'ECE', s5: 'CSE' };
  return { offers, joiningRecords, departmentByStudentId };
}

describe('buildSeasonReport', () => {
  test('assembles funnel, offer-to-joining, CTC, and per-company/role breakdowns from one call', () => {
    const { offers, joiningRecords, departmentByStudentId } = buildFixture();
    const report = buildSeasonReport({ offers, joiningRecords, departmentByStudentId });

    assert.equal(report.totalOffers, 5);
    assert.equal(report.funnel.total, 5);
    assert.equal(report.offerToJoining.accepted, 3);
    assert.equal(report.offerToJoining.joined, 2);
    assert.equal(report.offerToJoining.didNotJoin, 1);
    assert.equal(report.ctc.suppressed, false); // exactly 5 offers, default minGroupSize is 5

    const companyIds = report.byCompany.map((c) => c.companyId).sort();
    assert.deepEqual(companyIds, ['A', 'B', 'C']);

    const roleLabels = report.byRole.map((r) => r.dimensionValue);
    assert.deepEqual(roleLabels, ['SDE', 'Analyst']); // SDE has 3 offers, sorted first

    assert.equal(report.multipleOffers.declineReasons.totalDeclined, 1);
  });

  test('byDepartment only appears when a resolver map is supplied; byBatch stays absent otherwise', () => {
    const { offers, joiningRecords, departmentByStudentId } = buildFixture();

    const withDept = buildSeasonReport({ offers, joiningRecords, departmentByStudentId });
    assert.ok(Array.isArray(withDept.byDepartment));
    assert.equal(withDept.byBatch, undefined);
    const cseRow = withDept.byDepartment.find((r) => r.dimensionValue === 'CSE');
    assert.equal(cseRow.offerCount, 3); // s1, s2, s5

    const withoutDept = buildSeasonReport({ offers, joiningRecords });
    assert.equal(withoutDept.byDepartment, undefined);
  });
});

describe('CSV export', () => {
  test('companyScorecardToCsvRows produces one row per company plus a header', () => {
    const { offers, joiningRecords } = buildFixture();
    const report = buildSeasonReport({ offers, joiningRecords, minGroupSizeForCtc: 1 });
    const rows = companyScorecardToCsvRows(report);
    assert.equal(rows[0][0], 'companyId'); // header
    assert.equal(rows.length, 1 + 3); // header + 3 companies
  });

  test('toCsvString quotes values containing commas rather than corrupting the row', () => {
    const csv = toCsvString([
      ['name', 'note'],
      ['Acme, Inc.', 'plain'],
    ]);
    const lines = csv.split('\n');
    assert.equal(lines[1], '"Acme, Inc.",plain');
  });
});
