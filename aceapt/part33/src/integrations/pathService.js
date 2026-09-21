'use strict';

/**
 * Integration seam for PATH. See simulationService.js for the pattern and
 * rationale - not wired to a real PATH service in this build.
 */
function isAvailable() {
  return false;
}

async function notifyBottleneck(studentId, bottleneck) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: PATH service is not connected in this build.');
}

async function getStudentPathPriorities(studentId) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: PATH service is not connected in this build.');
}

module.exports = { isAvailable, notifyBottleneck, getStudentPathPriorities };
