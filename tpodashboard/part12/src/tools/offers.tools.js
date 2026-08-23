'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES, TPO_AND_MANAGEMENT } = require('./shared');

module.exports = [
  {
    name: 'get_offers',
    description: 'List offers, optionally filtered by status (pending_acceptance | accepted).',
    category: 'OFFERS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string' } } },
    handler: async (params, { user }) => svc.offers.list({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_expiring_offers',
    description: 'Offers pending acceptance that expire within a time window (default 48h).',
    category: 'OFFERS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { withinHours: { type: 'number' } } },
    handler: async (params, { user }) => svc.offers.expiring({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_joining_pending',
    description: 'Students who accepted an offer but have not confirmed joining.',
    category: 'JOINING',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.offers.joiningPending({ institutionId: user.institutionId }),
  },
  {
    name: 'get_placement_outcomes',
    description: 'Institution-wide placement count and rate.',
    category: 'JOINING',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.offers.placementOutcomes({ institutionId: user.institutionId }),
  },
];
