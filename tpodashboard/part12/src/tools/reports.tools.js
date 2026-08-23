'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_AND_MANAGEMENT, scopedDeptReport } = require('./shared');

module.exports = [
  {
    name: 'get_executive_metrics',
    description: 'Institution-wide eligible/applied/placed counts, application rate, placement rate vs. target, and the gap if below target.',
    category: 'REPORTS',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.reports.executiveMetrics({ institutionId: user.institutionId }),
  },
  {
    name: 'get_placement_funnel',
    description: 'Institution-wide eligible -> applied -> interviewed -> offered -> joined counts.',
    category: 'REPORTS',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.reports.placementFunnel({ institutionId: user.institutionId }),
  },
  {
    name: 'get_department_report',
    description: 'Per-department student count, average readiness, application rate, and interview conversion.',
    category: 'REPORTS',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => scopedDeptReport(user, svc.reports.departmentReport({ institutionId: user.institutionId })),
  },
];
