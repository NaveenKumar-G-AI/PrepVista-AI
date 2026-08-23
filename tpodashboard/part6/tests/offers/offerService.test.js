'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createOfferService } = require('../../services/offers/offerService');
const { OFFER_STATUSES } = require('../../services/offers/offerStateMachine');
const {
  createInMemoryOfferRepo,
  createInMemoryVersionRepo,
  createInMemoryAuditSink,
  createInMemoryEventBus,
} = require('../support/inMemoryRepos');

function buildService(overrides = {}) {
  const offerRepo = createInMemoryOfferRepo();
  const versionRepo = createInMemoryVersionRepo();
  const auditSink = createInMemoryAuditSink();
  const eventBus = createInMemoryEventBus();
  const service = createOfferService({
    offerRepo,
    versionRepo,
    auditSink,
    eventBus,
    hasFinalSelection: () => true,
    multipleOfferPolicy: { allowMultipleActive: true, mustDeclinePreviousOnAccept: false },
    clock: () => new Date('2026-08-10T00:00:00.000Z'),
    idGenerator: (() => {
      let n = 0;
      return () => `offer-${++n}`;
    })(),
    ...overrides,
  });
  return { service, offerRepo, versionRepo, auditSink, eventBus };
}

function sampleInput(overrides = {}) {
  return {
    institutionId: 'inst-1',
    seasonId: 'season-1',
    studentId: 'student-1',
    driveId: 'drive-1',
    companyId: 'company-1',
    roleTitle: 'Software Engineer',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    location: 'Bengaluru',
    offerDate: '2026-08-01',
    acceptanceDeadline: '2026-08-18T18:00:00.000Z',
    joiningDate: '2026-09-01',
    currency: 'INR',
    ctcTotalMinor: 80000000,
    ctcFixedMinor: 80000000,
    source: 'TPO_ENTERED',
    ...overrides,
  };
}

describe('offerService end-to-end lifecycle', () => {
  test('full path: create -> receive -> verify -> publish -> accept', () => {
    const { service, auditSink, eventBus } = buildService();

    const created = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    assert.equal(created.ok, true);
    assert.equal(created.offer.status, OFFER_STATUSES.DRAFT);

    service.receiveOffer(created.offer.id, { actor: 'tpo-1' });
    service.startVerification(created.offer.id, { actor: 'tpo-1' });
    const verified = service.verifyOffer(created.offer.id, { actor: 'tpo-1', existingOffers: [] });
    assert.equal(verified.ok, true);
    assert.equal(verified.offer.status, OFFER_STATUSES.VERIFIED);

    service.publishOffer(created.offer.id, { actor: 'tpo-1', studentOffers: [] });
    service.openAcceptanceWindow(created.offer.id, { actor: 'tpo-1' });

    const { offer: accepted } = service.acceptOffer(created.offer.id, {
      actor: 'student-1',
      studentOffers: [],
    });
    assert.equal(accepted.status, OFFER_STATUSES.ACCEPTED);

    // Every status change should have produced an audit entry.
    const statusChanges = auditSink.all().filter((e) => e.action === 'OFFER_STATUS_CHANGED');
    assert.equal(statusChanges.length, 6); // received, under_verification, verified, published, acceptance_pending, accepted

    assert.ok(eventBus.ofType('OFFER_ACCEPTED').length === 1);
  });

  test('a second accept on an already-accepted offer is rejected, not silently applied', () => {
    const { service } = buildService();
    const created = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    service.receiveOffer(created.offer.id, { actor: 'tpo-1' });
    service.startVerification(created.offer.id, { actor: 'tpo-1' });
    service.verifyOffer(created.offer.id, { actor: 'tpo-1', existingOffers: [] });
    service.publishOffer(created.offer.id, { actor: 'tpo-1', studentOffers: [] });
    service.openAcceptanceWindow(created.offer.id, { actor: 'tpo-1' });
    service.acceptOffer(created.offer.id, { actor: 'student-1', studentOffers: [] });

    assert.throws(
      () => service.acceptOffer(created.offer.id, { actor: 'student-1', studentOffers: [] }),
      (err) => err.code === 'ILLEGAL_OFFER_TRANSITION'
    );
  });

  test('creation is blocked by a duplicate active offer', () => {
    const { service } = buildService();
    const first = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    assert.equal(first.ok, true);

    const second = service.createOffer({
      input: sampleInput(),
      actor: 'tpo-1',
      existingOffers: [first.offer],
    });
    assert.equal(second.ok, false);
    assert.ok(second.conflicts.some((c) => c.type === 'DUPLICATE_OFFER'));
  });

  test('creation without a final selection is blocked unless explicitly overridden', () => {
    const { service } = buildService({ hasFinalSelection: () => false });
    const blocked = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    assert.equal(blocked.ok, false);

    const overridden = service.createOffer({
      input: sampleInput(),
      actor: 'tpo-1',
      allowUnselectedOverride: true,
    });
    assert.equal(overridden.ok, true);
  });

  test('verifyOffer sends the offer back to RECEIVED instead of silently accepting a conflict', () => {
    const { service } = buildService();
    const first = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });
    service.receiveOffer(first.offer.id, { actor: 'tpo-1' });
    service.startVerification(first.offer.id, { actor: 'tpo-1' });

    // A second, conflicting offer exists by the time verification runs.
    const conflicting = { ...first.offer, id: 'offer-conflict', status: 'PUBLISHED' };
    const result = service.verifyOffer(first.offer.id, {
      actor: 'tpo-1',
      existingOffers: [conflicting],
    });
    assert.equal(result.ok, false);
    assert.equal(result.offer.status, OFFER_STATUSES.RECEIVED);
  });

  test('publishOffer is blocked when policy disallows multiple active offers', () => {
    const { service, offerRepo } = buildService({
      multipleOfferPolicy: { allowMultipleActive: false },
    });
    const a = service.createOffer({ input: sampleInput({ companyId: 'company-a' }), actor: 'tpo-1' });
    const b = service.createOffer({
      input: sampleInput({ companyId: 'company-b' }),
      actor: 'tpo-1',
      existingOffers: [a.offer],
    });

    [a, b].forEach(({ offer }) => {
      service.receiveOffer(offer.id, { actor: 'tpo-1' });
      service.startVerification(offer.id, { actor: 'tpo-1' });
      service.verifyOffer(offer.id, { actor: 'tpo-1', existingOffers: [] });
    });
    service.publishOffer(a.offer.id, { actor: 'tpo-1', studentOffers: [] });

    // Re-fetch: `a` is now PUBLISHED, not the DRAFT snapshot captured at
    // createOffer() time. Policy checks must see current state, and this
    // is exactly the kind of stale-read bug the in-memory repo's
    // copy-on-read/copy-on-write behaviour is meant to catch in tests.
    const freshA = offerRepo.getById(a.offer.id);
    assert.throws(
      () => service.publishOffer(b.offer.id, { actor: 'tpo-1', studentOffers: [freshA] }),
      (err) => err.code === 'MULTIPLE_OFFER_POLICY_BLOCKED'
    );
  });

  test('correctOffer requires a reason and always versions the change', () => {
    const { service, versionRepo } = buildService();
    const created = service.createOffer({ input: sampleInput(), actor: 'tpo-1' });

    assert.throws(
      () => service.correctOffer(created.offer.id, { actor: 'tpo-1', fieldChanges: { ctcTotalMinor: 1 } }),
      (err) => err.code === 'REASON_REQUIRED'
    );

    const corrected = service.correctOffer(created.offer.id, {
      actor: 'tpo-1',
      fieldChanges: { ctcTotalMinor: 90000000, ctcFixedMinor: 90000000 },
      reason: 'Company revised the fixed component after finance review',
    });
    assert.equal(corrected.ctcTotalMinor, 90000000);
    assert.equal(versionRepo.listVersions(created.offer.id).length, 2); // create + correction
  });
});
