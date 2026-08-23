'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { detectOfferConflicts, hasBlockingConflicts, CONFLICT_TYPES } = require('../../services/offers/conflictDetection');

function baseOffer(overrides = {}) {
  return {
    id: 'offer-1',
    studentId: 'student-1',
    companyId: 'company-1',
    driveId: 'drive-1',
    ctcFixedMinor: 800000,
    ctcVariableMinor: 0,
    ctcTotalMinor: 800000,
    offerDate: '2026-08-01',
    joiningDate: '2026-09-01',
    acceptanceDeadline: '2026-08-18T18:00:00.000Z',
    status: 'ACCEPTANCE_PENDING',
    ...overrides,
  };
}

describe('offer conflict detection', () => {
  test('a clean offer with a final selection has no blocking conflicts', () => {
    const issues = detectOfferConflicts(baseOffer(), {
      existingOffers: [],
      hasFinalSelection: true,
    });
    assert.equal(hasBlockingConflicts(issues), false);
  });

  test('flags a duplicate active offer for the same student/company/drive', () => {
    const existing = baseOffer({ id: 'offer-0', status: 'PUBLISHED' });
    const issues = detectOfferConflicts(baseOffer(), {
      existingOffers: [existing],
      hasFinalSelection: true,
    });
    assert.ok(issues.some((i) => i.type === CONFLICT_TYPES.DUPLICATE_OFFER));
  });

  test('does not flag a duplicate against a DECLINED prior offer', () => {
    const existing = baseOffer({ id: 'offer-0', status: 'DECLINED' });
    const issues = detectOfferConflicts(baseOffer(), {
      existingOffers: [existing],
      hasFinalSelection: true,
    });
    assert.equal(issues.some((i) => i.type === CONFLICT_TYPES.DUPLICATE_OFFER), false);
  });

  test('flags inconsistent CTC (fixed + variable != total)', () => {
    const issues = detectOfferConflicts(
      baseOffer({ ctcFixedMinor: 500000, ctcVariableMinor: 100000, ctcTotalMinor: 800000 }),
      { existingOffers: [], hasFinalSelection: true }
    );
    assert.ok(issues.some((i) => i.type === CONFLICT_TYPES.CTC_INCONSISTENT));
  });

  test('flags joining date before offer date', () => {
    const issues = detectOfferConflicts(baseOffer({ joiningDate: '2026-07-01' }), {
      existingOffers: [],
      hasFinalSelection: true,
    });
    assert.ok(issues.some((i) => i.type === CONFLICT_TYPES.JOINING_BEFORE_OFFER_DATE));
  });

  test('flags acceptance deadline before offer date', () => {
    const issues = detectOfferConflicts(baseOffer({ acceptanceDeadline: '2026-07-01T00:00:00.000Z' }), {
      existingOffers: [],
      hasFinalSelection: true,
    });
    assert.ok(issues.some((i) => i.type === CONFLICT_TYPES.DEADLINE_BEFORE_OFFER_DATE));
  });

  test('blocks an offer for a student with no final selection unless overridden', () => {
    const blocked = detectOfferConflicts(baseOffer(), { existingOffers: [], hasFinalSelection: false });
    assert.ok(blocked.some((i) => i.type === CONFLICT_TYPES.STUDENT_NOT_SELECTED));

    const overridden = detectOfferConflicts(baseOffer(), {
      existingOffers: [],
      hasFinalSelection: false,
      allowUnselectedOverride: true,
    });
    assert.equal(overridden.some((i) => i.type === CONFLICT_TYPES.STUDENT_NOT_SELECTED), false);
  });

  test('negative CTC is always blocking', () => {
    const issues = detectOfferConflicts(baseOffer({ ctcTotalMinor: -100 }), {
      existingOffers: [],
      hasFinalSelection: true,
    });
    assert.ok(hasBlockingConflicts(issues));
  });
});
