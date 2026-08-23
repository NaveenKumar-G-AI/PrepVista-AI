'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeCompanyScorecard } = require('../../services/analytics/companyScorecard');

function offer(id, companyId, status, ctcTotalMinor) {
  return {
    id,
    companyId,
    status,
    ctcTotalMinor,
    statusHistory: [
      { status: 'PUBLISHED', at: '2026-08-01T00:00:00.000Z' },
      { status: 'ACCEPTANCE_PENDING', at: '2026-08-01T00:00:00.000Z' },
      { status, at: '2026-08-05T00:00:00.000Z' },
    ],
  };
}

describe('computeCompanyScorecard', () => {
  test('ranks companies by offer volume and computes joining rate from actual joining records', () => {
    const offers = [
      offer('o1', 'A', 'ACCEPTED', 900000),
      offer('o2', 'A', 'ACCEPTED', 950000),
      offer('o3', 'A', 'DECLINED', 850000),
      offer('o4', 'B', 'ACCEPTED', 700000),
    ];
    const joiningRecords = [
      { offerId: 'o1', status: 'JOINED' },
      { offerId: 'o2', status: 'DID_NOT_JOIN' },
      { offerId: 'o4', status: 'JOINED' },
    ];

    const rows = computeCompanyScorecard(offers, joiningRecords, { minGroupSizeForCtc: 1 });

    assert.equal(rows[0].companyId, 'A'); // more offers, sorted first
    assert.equal(rows[0].offersExtended, 3);
    assert.equal(rows[0].joiningRate, 0.5); // 1 joined of 2 accepted
    assert.equal(rows[0].didNotJoinCount, 1);

    const companyB = rows.find((r) => r.companyId === 'B');
    assert.equal(companyB.joiningRate, 1);
  });

  test('a company with fewer offers than minGroupSizeForCtc gets suppressed CTC stats, not an error', () => {
    const offers = [offer('o1', 'Tiny', 'ACCEPTED', 900000)];
    const rows = computeCompanyScorecard(offers, [], { minGroupSizeForCtc: 5 });
    assert.equal(rows[0].ctc.suppressed, true);
  });
});
