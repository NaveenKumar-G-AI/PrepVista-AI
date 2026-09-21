'use strict';

const store = require('../db/memoryStore');
const { canTransition } = require('../engines/applicationStateMachine');

function getOrInitApplication(opportunityId, studentId) {
  return store.getApplication(opportunityId, studentId) || store.upsertApplication(opportunityId, studentId, { status: 'DISCOVERED' });
}

/**
 * Validates the transition before writing it (spec sections 42-43) - a
 * student can't jump from DISCOVERED straight to INTERVIEW, for instance.
 */
function updateApplicationStatus(opportunityId, studentId, nextStatus) {
  const current = getOrInitApplication(opportunityId, studentId);
  if (!canTransition(current.status, nextStatus)) {
    return { error: 'INVALID_TRANSITION', from: current.status, to: nextStatus };
  }
  const patch = { status: nextStatus, ...(nextStatus === 'APPLIED' ? { appliedAt: new Date().toISOString() } : {}) };
  const updated = store.upsertApplication(opportunityId, studentId, patch);
  return { application: updated };
}

module.exports = { getOrInitApplication, updateApplicationStatus };
