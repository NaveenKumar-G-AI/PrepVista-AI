'use strict';

const crypto = require('node:crypto');
const {
  OFFER_STATUSES,
  assertTransition,
  isTerminal,
} = require('./offerStateMachine');
const { detectOfferConflicts, hasBlockingConflicts } = require('./conflictDetection');
const {
  evaluateNewOfferAgainstPolicy,
  evaluateAcceptance,
} = require('./multipleOfferPolicy');
const { OFFER_EVENTS, publish } = require('../../events/eventContract');
const { VERIFICATION_STATUSES } = require('../../schemas/offers/types');

/**
 * Offer domain service. Every method here is the ONLY place `offer.status`
 * is allowed to change - nothing upstream (routes, bulk import, etc.)
 * should mutate an offer record directly.
 *
 * @param {object} deps
 * @param {object} deps.offerRepo       - { getById, listByStudent, create, update }
 * @param {object} deps.versionRepo     - { addVersion(offerId, snapshot, meta) }
 * @param {object} deps.eventBus        - { emit(name, payload) }, owned by Part 1
 * @param {object} deps.auditSink       - { record(entry) }, owned by Part 1
 * @param {() => Date} [deps.clock]     - injectable for deterministic tests
 * @param {() => string} [deps.idGenerator]
 * @param {(args: {studentId: string, driveId: string}) => boolean} [deps.hasFinalSelection]
 *   - wire to Part 5's verified-final-outcome lookup in the real integration
 * @param {object} deps.multipleOfferPolicy - institution's configured policy object
 */
function createOfferService(deps) {
  const {
    offerRepo,
    versionRepo,
    eventBus,
    auditSink,
    clock = () => new Date(),
    idGenerator = () => crypto.randomUUID(),
    hasFinalSelection = () => true, // permissive default; wire to Part 5 in real integration
    multipleOfferPolicy,
  } = deps;

  function nowIso() {
    return clock().toISOString();
  }

  function audit(action, entityId, { oldValue, newValue, reason, actor, source, metadata } = {}) {
    auditSink.record({
      entity: 'offer',
      entityId,
      action,
      actor,
      oldValue,
      newValue,
      reason,
      source,
      metadata,
      at: nowIso(),
    });
  }

  function snapshotVersion(offer, { reason, actor, source }) {
    versionRepo.addVersion(offer.id, { ...offer }, {
      versionNumber: offer.currentVersion,
      reason,
      changedBy: actor,
      source,
      at: nowIso(),
    });
  }

  /**
   * Create a new offer in DRAFT status after running conflict detection.
   * Blocking conflicts stop creation unless `allowUnselectedOverride` is
   * explicitly passed AND the only blocking conflict is STUDENT_NOT_SELECTED -
   * every other blocking conflict always stops creation (spec section 20).
   */
  function createOffer({ input, actor, allowUnselectedOverride = false, existingOffers = [] }) {
    const candidate = { id: idGenerator(), ...input };
    const conflicts = detectOfferConflicts(candidate, {
      existingOffers,
      hasFinalSelection: hasFinalSelection({
        studentId: candidate.studentId,
        driveId: candidate.driveId,
      }),
      allowUnselectedOverride,
    });

    const blocking = conflicts.filter((c) => c.severity === 'BLOCKING');
    const onlyOverridable = blocking.every((c) => c.type === 'STUDENT_NOT_SELECTED');
    if (blocking.length > 0 && !(allowUnselectedOverride && onlyOverridable)) {
      return { ok: false, conflicts };
    }

    const offer = {
      ...candidate,
      status: OFFER_STATUSES.DRAFT,
      verificationStatus: VERIFICATION_STATUSES.NOT_STARTED,
      currentVersion: 1,
      // Denormalized, append-only record of every status this offer has
      // passed through. `status` alone can't answer "how many offers ever
      // reached VERIFIED" once some of them have since moved on to
      // ACCEPTED - analytics (services/analytics/funnel.js) reads this
      // directly instead of re-deriving it from offer_versions.
      statusHistory: [{ status: OFFER_STATUSES.DRAFT, at: nowIso() }],
      hasFinalSelection: hasFinalSelection({
        studentId: candidate.studentId,
        driveId: candidate.driveId,
      }),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    offerRepo.create(offer);
    snapshotVersion(offer, { reason: 'Offer created', actor, source: offer.source });
    audit('OFFER_CREATED', offer.id, { newValue: offer, actor, source: offer.source });
    publish(eventBus, OFFER_EVENTS.OFFER_CREATED, { offerId: offer.id, studentId: offer.studentId });

    return { ok: true, offer, conflicts };
  }

  function transitionTo(offerId, toStatus, { actor, reason, extra = {} } = {}) {
    const offer = offerRepo.getById(offerId);
    if (!offer) throw Object.assign(new Error('Offer not found'), { code: 'OFFER_NOT_FOUND' });

    assertTransition(offer.status, toStatus); // throws ILLEGAL_OFFER_TRANSITION if not allowed

    const oldValue = { status: offer.status };
    const updated = {
      ...offer,
      ...extra,
      status: toStatus,
      currentVersion: offer.currentVersion + 1,
      statusHistory: [...(offer.statusHistory ?? []), { status: toStatus, at: nowIso() }],
      updatedAt: nowIso(),
    };
    offerRepo.update(offerId, updated);
    snapshotVersion(updated, { reason, actor, source: 'STATUS_TRANSITION' });
    audit('OFFER_STATUS_CHANGED', offerId, {
      oldValue,
      newValue: { status: toStatus },
      reason,
      actor,
    });
    return updated;
  }

  function receiveOffer(offerId, { actor } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.RECEIVED, { actor, reason: 'Offer logged as received' });
    publish(eventBus, OFFER_EVENTS.OFFER_RECEIVED, { offerId });
    return offer;
  }

  function startVerification(offerId, { actor } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.UNDER_VERIFICATION, {
      actor,
      reason: 'Verification started',
      extra: { verificationStatus: VERIFICATION_STATUSES.IN_PROGRESS },
    });
    publish(eventBus, OFFER_EVENTS.OFFER_VERIFICATION_STARTED, { offerId });
    return offer;
  }

  /**
   * Re-runs conflict detection before allowing VERIFIED. If blocking
   * conflicts remain, the offer is sent back to RECEIVED instead - it
   * never silently becomes VERIFIED with an unresolved conflict
   * (spec section 13).
   */
  function verifyOffer(offerId, { actor, existingOffers = [] } = {}) {
    const offer = offerRepo.getById(offerId);
    if (!offer) throw Object.assign(new Error('Offer not found'), { code: 'OFFER_NOT_FOUND' });

    const conflicts = detectOfferConflicts(offer, {
      existingOffers,
      hasFinalSelection: offer.hasFinalSelection,
      allowUnselectedOverride: true, // already decided at creation time
    });

    if (hasBlockingConflicts(conflicts)) {
      const sentBack = transitionTo(offerId, OFFER_STATUSES.RECEIVED, {
        actor,
        reason: 'Sent back: blocking conflict detected during verification',
        extra: { verificationStatus: VERIFICATION_STATUSES.CONFLICT },
      });
      return { ok: false, offer: sentBack, conflicts };
    }

    const verified = transitionTo(offerId, OFFER_STATUSES.VERIFIED, {
      actor,
      reason: 'Verified by TPO',
      extra: { verificationStatus: VERIFICATION_STATUSES.VERIFIED },
    });
    publish(eventBus, OFFER_EVENTS.OFFER_VERIFIED, { offerId });
    return { ok: true, offer: verified, conflicts };
  }

  /** VERIFIED -> PUBLISHED. Enforces the multiple-offer policy (section 28/29). */
  function publishOffer(offerId, { actor, studentOffers = [] } = {}) {
    const offer = offerRepo.getById(offerId);
    if (!offer) throw Object.assign(new Error('Offer not found'), { code: 'OFFER_NOT_FOUND' });

    const { allowed, reasons } = evaluateNewOfferAgainstPolicy({
      policy: multipleOfferPolicy,
      studentOffers: studentOffers.filter((o) => o.id !== offer.id),
    });
    if (!allowed) {
      throw Object.assign(new Error(`Publish blocked by multiple-offer policy: ${reasons.join(', ')}`), {
        code: 'MULTIPLE_OFFER_POLICY_BLOCKED',
        reasons,
      });
    }

    const published = transitionTo(offerId, OFFER_STATUSES.PUBLISHED, {
      actor,
      reason: 'Published to student',
    });
    publish(eventBus, OFFER_EVENTS.OFFER_PUBLISHED, { offerId, studentId: offer.studentId });

    const otherActive = studentOffers.filter((o) => o.id !== offer.id);
    if (otherActive.length > 0) {
      publish(eventBus, OFFER_EVENTS.MULTIPLE_OFFER_DETECTED, {
        studentId: offer.studentId,
        offerIds: [offer.id, ...otherActive.map((o) => o.id)],
      });
    }
    return published;
  }

  function openAcceptanceWindow(offerId, { actor } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.ACCEPTANCE_PENDING, {
      actor,
      reason: 'Acceptance window opened',
    });
    publish(eventBus, OFFER_EVENTS.OFFER_ACCEPTANCE_PENDING, { offerId });
    return offer;
  }

  /**
   * Student accepts. Guards against the "double click accept" race
   * (spec section 71) for free: once status is already ACCEPTED, the
   * required from-state (ACCEPTANCE_PENDING) no longer matches, so the
   * second call's assertTransition throws ILLEGAL_OFFER_TRANSITION
   * rather than silently succeeding twice.
   */
  function acceptOffer(offerId, { actor, studentOffers = [] } = {}) {
    const offer = offerRepo.getById(offerId);
    if (!offer) throw Object.assign(new Error('Offer not found'), { code: 'OFFER_NOT_FOUND' });
    if (offer.status !== OFFER_STATUSES.ACCEPTANCE_PENDING) {
      // Fails fast with a clear reason before even consulting policy -
      // covers the double-accept case explicitly rather than relying only
      // on the assertTransition error inside transitionTo.
      assertTransition(offer.status, OFFER_STATUSES.ACCEPTED);
    }

    const { allowed, reasons, declineOfferIds } = evaluateAcceptance({
      policy: multipleOfferPolicy,
      offerToAccept: offer,
      studentOffers,
    });
    if (!allowed) {
      throw Object.assign(new Error(`Acceptance blocked by policy: ${reasons.join(', ')}`), {
        code: 'MULTIPLE_OFFER_POLICY_BLOCKED',
        reasons,
      });
    }

    const accepted = transitionTo(offerId, OFFER_STATUSES.ACCEPTED, {
      actor,
      reason: 'Accepted by student',
      extra: { acceptedAt: nowIso() },
    });
    publish(eventBus, OFFER_EVENTS.OFFER_ACCEPTED, { offerId, studentId: offer.studentId });

    for (const otherId of declineOfferIds) {
      declineOffer(otherId, {
        actor,
        reasonCategory: 'ACCEPTED_ANOTHER_OFFER',
        reasonNote: `Auto-declined: student accepted offer ${offerId}`,
      });
    }

    return { offer: accepted, autoDeclinedOfferIds: declineOfferIds };
  }

  function declineOffer(offerId, { actor, reasonCategory, reasonNote } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.DECLINED, {
      actor,
      reason: reasonNote || reasonCategory || 'Declined by student',
      extra: { declineReasonCategory: reasonCategory, declineReasonNote: reasonNote },
    });
    publish(eventBus, OFFER_EVENTS.OFFER_DECLINED, { offerId, studentId: offer.studentId, reasonCategory });
    return offer;
  }

  function expireOffer(offerId, { actor = 'SYSTEM' } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.EXPIRED, {
      actor,
      reason: 'Acceptance deadline passed without response',
    });
    publish(eventBus, OFFER_EVENTS.OFFER_EXPIRED, { offerId, studentId: offer.studentId });
    return offer;
  }

  function withdrawOffer(offerId, { actor, reason } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.WITHDRAWN, { actor, reason });
    publish(eventBus, OFFER_EVENTS.OFFER_WITHDRAWN, { offerId, studentId: offer.studentId, reason });
    return offer;
  }

  function cancelOffer(offerId, { actor, reason } = {}) {
    const offer = transitionTo(offerId, OFFER_STATUSES.CANCELLED, { actor, reason });
    publish(eventBus, OFFER_EVENTS.OFFER_CANCELLED, { offerId, studentId: offer.studentId, reason });
    return offer;
  }

  /**
   * Corrects field values (e.g. wrong CTC) WITHOUT changing status.
   * Always versioned (section 12/61) - never a silent overwrite.
   */
  function correctOffer(offerId, { actor, fieldChanges, reason }) {
    const offer = offerRepo.getById(offerId);
    if (!offer) throw Object.assign(new Error('Offer not found'), { code: 'OFFER_NOT_FOUND' });
    if (!reason) {
      throw Object.assign(new Error('A correction requires a reason.'), { code: 'REASON_REQUIRED' });
    }
    const oldValue = Object.fromEntries(Object.keys(fieldChanges).map((k) => [k, offer[k]]));
    const updated = {
      ...offer,
      ...fieldChanges,
      currentVersion: offer.currentVersion + 1,
      updatedAt: nowIso(),
    };
    offerRepo.update(offerId, updated);
    snapshotVersion(updated, { reason, actor, source: 'CORRECTION' });
    audit('OFFER_CORRECTED', offerId, { oldValue, newValue: fieldChanges, reason, actor });
    publish(eventBus, OFFER_EVENTS.OFFER_CORRECTED, {
      offerId,
      wasPublished: [
        OFFER_STATUSES.PUBLISHED,
        OFFER_STATUSES.ACCEPTANCE_PENDING,
        OFFER_STATUSES.ACCEPTED,
      ].includes(offer.status),
      changedFields: Object.keys(fieldChanges),
    });
    return updated;
  }

  return {
    createOffer,
    receiveOffer,
    startVerification,
    verifyOffer,
    publishOffer,
    openAcceptanceWindow,
    acceptOffer,
    declineOffer,
    expireOffer,
    withdrawOffer,
    cancelOffer,
    correctOffer,
    isTerminal,
  };
}

module.exports = { createOfferService };
