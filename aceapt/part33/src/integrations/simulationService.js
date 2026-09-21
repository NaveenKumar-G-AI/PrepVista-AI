'use strict';

/**
 * Integration seam for Feature 31 (Simulator). No existing ACEAPT codebase
 * was available in this build session, so this is honestly NOT wired to a
 * real implementation - isAvailable() returns false and the one real
 * function throws a clearly-labeled error rather than faking a result
 * (spec section 65: NO FABRICATION; section 79: ERROR HANDLING).
 *
 * To connect it for real: implement these same two exports against
 * Feature 31's actual service/API, matching this return shape. Nothing
 * elsewhere in Feature 33 needs to change - see opportunityService.js and
 * the POST /api/opportunities/:id/simulate route, which already call
 * isAvailable() first and degrade gracefully when it's false.
 */
function isAvailable() {
  return false;
}

async function runOpportunityAlignedSimulation({ studentId, opportunityId, requirements }) { // eslint-disable-line no-unused-vars
  throw new Error('NOT_INTEGRATED: Feature 31 simulation service is not connected in this build.');
}

module.exports = { isAvailable, runOpportunityAlignedSimulation };
