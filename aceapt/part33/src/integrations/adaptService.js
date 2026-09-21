'use strict';

/**
 * Integration seam for ADAPT. See simulationService.js for the pattern and
 * rationale - not wired to a real ADAPT service in this build.
 */
function isAvailable() {
  return false;
}

async function createIntervention(studentId, capabilityId, context) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: ADAPT service is not connected in this build.');
}

module.exports = { isAvailable, createIntervention };
