'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeFunnel,
  computeOfferToJoiningFunnel,
  computeOfferTimingMetrics,
  computeJoiningTimingMetrics,
} = require('../../services/analytics/funnel');
const { createOfferService } = require('../../services/offers/offerService');
const { createJoiningService } = require('../../services/joining/joiningService');
const {
  createInMemoryOfferRepo,
  createInMemoryVersionRepo,
  createInMemoryJoiningRepo,
  createInMemoryAuditSink,
  createInMemoryEventBus,
} = require('../support/inMemoryRepos');
const { createManualClock } = require('../support/manualClock');

function offerWithHistory(id, historyStatuses, extra = {}) {
  return {
    id,
    status: historyStatuses[historyStatuses.length - 1],
    statusHistory: historyStatuses.map((status, i) => ({
      status,
      at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    })),
    ...extra,
  };
}

describe('computeFunnel - counts offers that REACHED a stage, not just offers currently there', () => {
  test('an offer now ACCEPTED still counts toward every upstream stage it passed through', () => {
    const draftOnly = offerWithHistory('o1', ['DRAFT']);
    const accepted = offerWithHistory('o2', [
      'DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED', 'PUBLISHED', 'ACCEPTANCE_PENDING', 'ACCEPTED',
    ]);
    const declined = offerWithHistory('o3', [
      'DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED', 'PUBLISHED', 'ACCEPTANCE_PENDING', 'DECLINED',
    ]);
    const stillVerified = offerWithHistory('o4', ['DRAFT', 'RECEIVED', 'UNDER_VERIFICATION', 'VERIFIED']);

    const funnel = computeFunnel([draftOnly, accepted, declined, stillVerified]);

    assert.equal(funnel.total, 4);
    assert.equal(funnel.stageReachedCounts.RECEIVED, 3); // everyone except draftOnly
    assert.equal(funnel.stageReachedCounts.VERIFIED, 3); // accepted + declined + stillVerified
    assert.equal(funnel.stageReachedCounts.ACCEPTANCE_PENDING, 2); // accepted + declined
    assert.equal(funnel.stageReachedCounts.ACCEPTED, 1);
    assert.equal(funnel.declined, 1);
    assert.equal(funnel.acceptanceRate, 0.5); // 1 accepted / 2 that reached ACCEPTANCE_PENDING
    assert.equal(funnel.declineRate, 0.5);
  });

  test('rates are null (not 0 or NaN) when nobody has reached the denominator stage yet', () => {
    const funnel = computeFunnel([offerWithHistory('o1', ['DRAFT'])]);
    assert.equal(funnel.acceptanceRate, null);
    assert.equal(funnel.declineRate, null);
  });
});

describe('computeOfferToJoiningFunnel - the metric the original build was missing', () => {
  test('computes offer-to-joining and did-not-join rates against ACCEPTED offers', () => {
    const offers = [
      offerWithHistory('a', ['DRAFT', 'ACCEPTED']),
      offerWithHistory('b', ['DRAFT', 'ACCEPTED']),
      offerWithHistory('c', ['DRAFT', 'ACCEPTED']),
      offerWithHistory('d', ['DRAFT', 'ACCEPTED']),
    ];
    const joiningRecords = [
      { offerId: 'a', status: 'JOINED' },
      { offerId: 'b', status: 'JOINED' },
      { offerId: 'c', status: 'DID_NOT_JOIN' },
      // 'd' has no joining record yet - still pending
    ];
    const result = computeOfferToJoiningFunnel(offers, joiningRecords);
    assert.equal(result.accepted, 4);
    assert.equal(result.joined, 2);
    assert.equal(result.didNotJoin, 1);
    assert.equal(result.joiningPending, 1);
    assert.equal(result.offerToJoiningRate, 0.5);
    assert.equal(result.didNotJoinRate, 0.25);
  });

  test('returns null rates rather than dividing by zero when nobody has accepted', () => {
    const result = computeOfferToJoiningFunnel([], []);
    assert.equal(result.offerToJoiningRate, null);
  });
});

describe('timing metrics use real statusHistory produced by the actual services', () => {
  function buildOfferService(clock) {
    return createOfferService({
      offerRepo: createInMemoryOfferRepo(),
      versionRepo: createInMemoryVersionRepo(),
      auditSink: createInMemoryAuditSink(),
      eventBus: createInMemoryEventBus(),
      hasFinalSelection: () => true,
      multipleOfferPolicy: { allowMultipleActive: true },
      clock,
      idGenerator: (() => {
        let n = 0;
        return () => `offer-${++n}`;
      })(),
    });
  }

  function sampleInput() {
    return {
      studentId: 'student-1',
      driveId: 'drive-1',
      companyId: 'company-1',
      roleTitle: 'SDE',
      offerDate: '2026-08-01',
      acceptanceDeadline: '2026-08-18T18:00:00.000Z',
      joiningDate: '2026-09-01',
      ctcTotalMinor: 80000000,
      ctcFixedMinor: 80000000,
      source: 'TPO_ENTERED',
    };
  }

  test('timeToVerifyHours reflects the actual elapsed time between RECEIVED and VERIFIED', () => {
    const clock = createManualClock('2026-08-01T00:00:00.000Z');
    const service = buildOfferService(clock);

    const created = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    service.receiveOffer(created.offer.id, { actor: 'tpo-1' });
    clock.advance(5 * 3600 * 1000); // 5 hours in verification
    service.startVerification(created.offer.id, { actor: 'tpo-1' });
    clock.advance(3 * 3600 * 1000); // verification itself takes 3 more hours
    const { offer } = service.verifyOffer(created.offer.id, { actor: 'tpo-1', existingOffers: [] });

    const timing = computeOfferTimingMetrics([offer]);
    assert.equal(timing.timeToVerifyHours.count, 1);
    assert.equal(timing.timeToVerifyHours.mean, 8); // 5h to start + 3h verifying = 8h total from RECEIVED
  });

  test('timeToDecideHours reflects elapsed time between PUBLISHED and ACCEPTED', () => {
    const clock = createManualClock('2026-08-01T00:00:00.000Z');
    const service = buildOfferService(clock);

    const created = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    service.receiveOffer(created.offer.id, { actor: 'tpo-1' });
    service.startVerification(created.offer.id, { actor: 'tpo-1' });
    service.verifyOffer(created.offer.id, { actor: 'tpo-1', existingOffers: [] });
    service.publishOffer(created.offer.id, { actor: 'tpo-1', studentOffers: [] });
    service.openAcceptanceWindow(created.offer.id, { actor: 'tpo-1' });
    clock.advance(30 * 3600 * 1000); // student takes 30 hours to decide
    const { offer: accepted } = service.acceptOffer(created.offer.id, { actor: 'student-1', studentOffers: [] });

    const timing = computeOfferTimingMetrics([accepted]);
    assert.equal(timing.timeToDecideHours.count, 1);
    assert.equal(timing.timeToDecideHours.mean, 30);
  });

  test('joining timing: time from CONFIRMED to JOINED', () => {
    const clock = createManualClock('2026-09-01T00:00:00.000Z');
    const joiningService = createJoiningService({
      joiningRepo: createInMemoryJoiningRepo(),
      auditSink: createInMemoryAuditSink(),
      eventBus: createInMemoryEventBus(),
      clock,
      idGenerator: (() => {
        let n = 0;
        return () => `joining-${++n}`;
      })(),
    });

    const record = joiningService.createJoiningRecord({
      offerId: 'offer-1',
      studentId: 'student-1',
      expectedJoiningDate: '2026-09-01',
      actor: 'tpo-1',
    });
    joiningService.confirmJoining(record.id, { actor: 'student-1' });
    clock.advance(48 * 3600 * 1000);
    joiningService.submitEvidence(record.id, { actor: 'student-1', evidenceDocumentId: 'doc-1' });
    clock.advance(24 * 3600 * 1000);
    const joined = joiningService.verifyJoined(record.id, { actor: 'tpo-1' });

    const timing = computeJoiningTimingMetrics([joined]);
    assert.equal(timing.timeToJoinAfterConfirmHours.count, 1);
    assert.equal(timing.timeToJoinAfterConfirmHours.mean, 72);
  });
});
