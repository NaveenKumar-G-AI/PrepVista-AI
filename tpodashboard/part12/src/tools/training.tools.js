'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES } = require('./shared');

module.exports = [
  {
    name: 'get_training_programs',
    description: 'List training programs run this season.',
    category: 'TRAINING',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.training.programs({ institutionId: user.institutionId }),
  },
  {
    name: 'get_training_effectiveness',
    description:
      'Completions vs. assessed-improvement for a training program. Explicitly flags when assessment data covers fewer students than completed the program, and scopes the reported improvement to only the assessed subset.',
    category: 'TRAINING',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['programId'], additionalProperties: false, properties: { programId: { type: 'string' } } },
    handler: async (params, { user }) => svc.training.effectiveness({ institutionId: user.institutionId, programId: params.programId }),
  },
];
