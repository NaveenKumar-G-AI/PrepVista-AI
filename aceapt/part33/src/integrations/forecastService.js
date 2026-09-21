'use strict';

/**
 * Integration seam for FORECAST. See simulationService.js for the pattern
 * and rationale - not wired to a real FORECAST service in this build.
 */
function isAvailable() {
  return false;
}

async function getReadinessForecast(studentId, targetId) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: FORECAST service is not connected in this build.');
}

module.exports = { isAvailable, getReadinessForecast };
