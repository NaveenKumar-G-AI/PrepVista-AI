'use strict';

/**
 * Integration seam for PROOF. See simulationService.js for the pattern and
 * rationale - not wired to a real PROOF service in this build.
 */
function isAvailable() {
  return false;
}

async function getEvidenceForCapability(studentId, capabilityId) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: PROOF service is not connected in this build.');
}

module.exports = { isAvailable, getEvidenceForCapability };
