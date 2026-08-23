'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES, TPO_AND_MANAGEMENT, scopedDeptReport } = require('./shared');

module.exports = [
  {
    name: 'get_today_interviews',
    description: "Interviews scheduled for today.",
    category: 'INTERVIEWS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.interviews.today({ institutionId: user.institutionId }),
  },
  {
    name: 'get_pending_results',
    description: 'Interviews that completed but have no recorded result yet, older than a threshold (default 24h).',
    category: 'INTERVIEWS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { olderThanHours: { type: 'number' } } },
    handler: async (params, { user }) => svc.interviews.pendingResults({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_interview_issues',
    description: 'Interview-stage problems worth TPO attention (currently: pending results older than 24h).',
    category: 'INTERVIEWS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.interviews.pendingResults({ institutionId: user.institutionId, olderThanHours: 24 }),
  },
  {
    name: 'get_round_conversion',
    description: 'Interview pass rate overall or by department, with the institutional median for comparison.',
    category: 'INTERVIEWS',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: { department: { type: 'string' } } },
    handler: async (params, { user }) => {
      const result = svc.interviews.roundConversion({ institutionId: user.institutionId, ...params });
      return { ...result, ratesPct: scopedDeptReport(user, result.ratesPct) };
    },
  },
];
