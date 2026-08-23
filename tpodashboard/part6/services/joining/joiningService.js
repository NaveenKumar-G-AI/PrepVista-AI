'use strict';

const crypto = require('node:crypto');
const {
  JOINING_STATUSES,
  assertTransition,
  assertJoinedHasEvidence,
} = require('./joiningStateMachine');
const { JOINING_EVENTS, publish } = require('../../events/eventContract');

/**
 * Joining domain service. Mirrors offerService's shape: one place owns
 * every status change, every change is versioned via audit, every change
 * emits an event Part 9 (communication) can react to.
 *
 * @param {object} deps
 * @param {object} deps.joiningRepo - { getById, getByOfferId, create, update }
 * @param {object} deps.eventBus
 * @param {object} deps.auditSink
 * @param {() => Date} [deps.clock]
 * @param {() => string} [deps.idGenerator]
 */
function createJoiningService(deps) {
  const {
    joiningRepo,
    eventBus,
    auditSink,
    clock = () => new Date(),
    idGenerator = () => crypto.randomUUID(),
  } = deps;

  function nowIso() {
    return clock().toISOString();
  }

  function audit(action, entityId, { oldValue, newValue, reason, actor } = {}) {
    auditSink.record({
      entity: 'joining_record',
      entityId,
      action,
      actor,
      oldValue,
      newValue,
      reason,
      at: nowIso(),
    });
  }

  /**
   * Created once an offer is ACCEPTED. The caller (offerService consumer /
   * an event handler on OFFER_ACCEPTED) supplies offerId/studentId/expected
   * date - this module never reaches into the offers table itself.
   */
  function createJoiningRecord({ offerId, studentId, expectedJoiningDate, actor }) {
    const record = {
      id: idGenerator(),
      offerId,
      studentId,
      expectedJoiningDate,
      confirmedJoiningDate: null,
      status: JOINING_STATUSES.PENDING,
      // Same denormalized pattern as offer.statusHistory - lets analytics
      // compute "time from confirmed to joined" etc. without re-deriving
      // it from an audit trail.
      statusHistory: [{ status: JOINING_STATUSES.PENDING, at: nowIso() }],
      evidenceDocumentId: null,
      verifiedBy: null,
      verifiedAt: null,
      remarks: null,
      reason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    joiningRepo.create(record);
    audit('JOINING_CREATED', record.id, { newValue: record, actor });
    publish(eventBus, JOINING_EVENTS.JOINING_CREATED, { joiningRecordId: record.id, offerId, studentId });
    return record;
  }

  function transitionTo(recordId, toStatus, { actor, reason, extra = {} } = {}) {
    const record = joiningRepo.getById(recordId);
    if (!record) {
      throw Object.assign(new Error('Joining record not found'), { code: 'JOINING_RECORD_NOT_FOUND' });
    }
    assertTransition(record.status, toStatus);

    const candidate = {
      ...record,
      ...extra,
      status: toStatus,
      statusHistory: [...(record.statusHistory ?? []), { status: toStatus, at: nowIso() }],
      updatedAt: nowIso(),
    };
    assertJoinedHasEvidence(candidate); // no-op unless toStatus === JOINED

    joiningRepo.update(recordId, candidate);
    audit('JOINING_STATUS_CHANGED', recordId, {
      oldValue: { status: record.status },
      newValue: { status: toStatus },
      reason,
      actor,
    });
    return candidate;
  }

  /** Student self-report: "I confirm that I intend to join." Not a verified outcome. */
  function confirmJoining(recordId, { actor, confirmedJoiningDate } = {}) {
    const record = transitionTo(recordId, JOINING_STATUSES.CONFIRMED, {
      actor,
      reason: 'Student confirmed intent to join',
      extra: { confirmedJoiningDate: confirmedJoiningDate ?? null },
    });
    publish(eventBus, JOINING_EVENTS.JOINING_CONFIRMED, {
      joiningRecordId: recordId,
      studentId: record.studentId,
    });
    return record;
  }

  function submitEvidence(recordId, { actor, evidenceDocumentId } = {}) {
    const record = transitionTo(recordId, JOINING_STATUSES.UNVERIFIED, {
      actor,
      reason: 'Joining evidence submitted, awaiting TPO verification',
      extra: { evidenceDocumentId },
    });
    publish(eventBus, JOINING_EVENTS.JOINING_CONFIRMATION_SUBMITTED, {
      joiningRecordId: recordId,
      studentId: record.studentId,
    });
    return record;
  }

  /**
   * TPO-only action. This is the ONLY path to JOINED - a student cannot
   * self-verify (enforced by assertJoinedHasEvidence inside transitionTo).
   */
  function verifyJoined(recordId, { actor, verifiedAt } = {}) {
    if (!actor) {
      throw Object.assign(new Error('verifyJoined requires an actor (TPO user id).'), {
        code: 'ACTOR_REQUIRED',
      });
    }
    const record = transitionTo(recordId, JOINING_STATUSES.JOINED, {
      actor,
      reason: 'Joining verified by TPO',
      extra: { verifiedBy: actor, verifiedAt: verifiedAt ?? nowIso() },
    });
    publish(eventBus, JOINING_EVENTS.JOINING_CONFIRMATION_VERIFIED, {
      joiningRecordId: recordId,
      studentId: record.studentId,
    });
    return record;
  }

  function markDelayed(recordId, { actor, newExpectedDate, reason } = {}) {
    const record = transitionTo(recordId, JOINING_STATUSES.DELAYED, {
      actor,
      reason,
      extra: newExpectedDate ? { expectedJoiningDate: newExpectedDate } : {},
    });
    publish(eventBus, JOINING_EVENTS.JOINING_DELAYED, {
      joiningRecordId: recordId,
      studentId: record.studentId,
      reason,
    });
    return record;
  }

  function markDidNotJoin(recordId, { actor, reasonCategory, remarks } = {}) {
    const record = transitionTo(recordId, JOINING_STATUSES.DID_NOT_JOIN, {
      actor,
      reason: remarks || reasonCategory,
      extra: { reason: reasonCategory, remarks },
    });
    publish(eventBus, JOINING_EVENTS.JOINING_DID_NOT_JOIN, {
      joiningRecordId: recordId,
      studentId: record.studentId,
      reasonCategory,
    });
    return record;
  }

  function cancelJoiningRecord(recordId, { actor, reason } = {}) {
    return transitionTo(recordId, JOINING_STATUSES.CANCELLED, { actor, reason });
  }

  // --- read-side helpers (safe for the future TPO AI layer, section 51) ---

  function getJoiningStatus(recordId) {
    return joiningRepo.getById(recordId);
  }

  function getPendingJoining(allRecords) {
    return allRecords.filter((r) =>
      [JOINING_STATUSES.PENDING, JOINING_STATUSES.CONFIRMED, JOINING_STATUSES.UNVERIFIED].includes(
        r.status
      )
    );
  }

  function getDidNotJoin(allRecords) {
    return allRecords.filter((r) => r.status === JOINING_STATUSES.DID_NOT_JOIN);
  }

  return {
    createJoiningRecord,
    confirmJoining,
    submitEvidence,
    verifyJoined,
    markDelayed,
    markDidNotJoin,
    cancelJoiningRecord,
    getJoiningStatus,
    getPendingJoining,
    getDidNotJoin,
  };
}

module.exports = { createJoiningService };
