'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateImportRows } = require('../../services/offers/bulkImport');

function resolvers(overrides = {}) {
  return {
    resolveStudentByRegisterNumber: (regNo) => (regNo === 'REG001' ? { id: 'student-1' } : null),
    resolveCompanyByName: (name) => (name === 'ABC Technologies' ? { id: 'company-1' } : null),
    hasFinalSelection: () => true,
    existingOffersByStudent: () => [],
    driveIdForCompanyRole: () => 'drive-1',
    ...overrides,
  };
}

function goodRow(overrides = {}) {
  return {
    registerNumber: 'REG001',
    companyName: 'ABC Technologies',
    roleTitle: 'Software Engineer',
    ctcTotal: '800000',
    location: 'Bengaluru',
    offerDate: '2026-08-01',
    joiningDate: '2026-09-01',
    acceptanceDeadline: '2026-08-18T18:00:00.000Z',
    ...overrides,
  };
}

describe('bulk offer import validation', () => {
  test('a well-formed row becomes a valid offer candidate', () => {
    const { valid, conflicts, errors } = validateImportRows([goodRow()], resolvers());
    assert.equal(valid.length, 1);
    assert.equal(conflicts.length, 0);
    assert.equal(errors.length, 0);
    assert.equal(valid[0].offer.ctcTotalMinor, 80000000);
  });

  test('never silently drops a row with missing required fields - reports it instead', () => {
    const { valid, errors } = validateImportRows([goodRow({ ctcTotal: undefined })], resolvers());
    assert.equal(valid.length, 0);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].type, 'MISSING_FIELDS');
  });

  test('flags an unknown student instead of guessing or skipping', () => {
    const { errors } = validateImportRows([goodRow({ registerNumber: 'UNKNOWN' })], resolvers());
    assert.equal(errors[0].type, 'UNKNOWN_STUDENT');
  });

  test('flags duplicate rows within the same import file', () => {
    const { valid, conflicts } = validateImportRows([goodRow(), goodRow()], resolvers());
    assert.equal(valid.length, 1);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, 'DUPLICATE_IMPORT_ROW');
  });

  test('flags a row that conflicts with an already-existing active offer', () => {
    const existing = {
      id: 'offer-existing',
      studentId: 'student-1',
      companyId: 'company-1',
      driveId: 'drive-1',
      status: 'PUBLISHED',
    };
    const { conflicts } = validateImportRows(
      [goodRow()],
      resolvers({ existingOffersByStudent: () => [existing] })
    );
    assert.ok(conflicts.some((c) => c.type === 'DUPLICATE_OFFER'));
  });

  test('a mixed batch reports per-row results rather than failing the whole import', () => {
    // Each row is deliberately distinct (different role) so the two bad
    // rows are caught for their OWN reason rather than tripping the
    // duplicate-row check against row 1.
    const rows = [
      goodRow(),
      goodRow({ registerNumber: 'UNKNOWN', roleTitle: 'Backend Engineer' }),
      goodRow({ ctcTotal: 'not-a-number', roleTitle: 'Frontend Engineer' }),
    ];
    const { valid, errors } = validateImportRows(rows, resolvers());
    assert.equal(valid.length, 1);
    assert.equal(errors.length, 2);
    assert.deepEqual(
      errors.map((e) => e.type),
      ['UNKNOWN_STUDENT', 'INVALID_CTC']
    );
  });
});
