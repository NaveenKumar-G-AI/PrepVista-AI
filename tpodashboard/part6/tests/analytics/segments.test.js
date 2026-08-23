'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { compareSegments } = require('../../services/analytics/segments');

function offer(id, studentId, companyId, status, ctcTotalMinor) {
  return {
    id,
    studentId,
    companyId,
    status,
    ctcTotalMinor,
    statusHistory: [{ status, at: '2026-08-01T00:00:00.000Z' }],
  };
}

describe('compareSegments', () => {
  test('groups by an arbitrary resolver (e.g. department-by-student) and sorts largest first', () => {
    const departmentByStudent = { s1: 'CSE', s2: 'CSE', s3: 'ECE' };
    const offers = [
      offer('o1', 's1', 'c1', 'ACCEPTED', 800000),
      offer('o2', 's2', 'c1', 'ACCEPTED', 900000),
      offer('o3', 's3', 'c2', 'DECLINED', 700000),
    ];

    const rows = compareSegments(offers, (o) => departmentByStudent[o.studentId], { minGroupSizeForCtc: 1 });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].dimensionValue, 'CSE'); // 2 offers, sorted first
    assert.equal(rows[0].offerCount, 2);
    assert.equal(rows[1].dimensionValue, 'ECE');
  });

  test('an offer with no resolvable dimension value falls into UNKNOWN rather than being dropped', () => {
    const offers = [offer('o1', 's1', 'c1', 'ACCEPTED', 800000)];
    const rows = compareSegments(offers, () => undefined, { minGroupSizeForCtc: 1 });
    assert.equal(rows[0].dimensionValue, 'UNKNOWN');
    assert.equal(rows[0].offerCount, 1);
  });
});
