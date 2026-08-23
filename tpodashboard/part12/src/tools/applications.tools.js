'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES, scopedDept } = require('./shared');

module.exports = [
  {
    name: 'get_drive_applications',
    description: 'List applications submitted to a specific drive.',
    category: 'APPLICATIONS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.applications.forDrive({ institutionId: user.institutionId, driveId: params.driveId }),
  },
  {
    name: 'get_application_funnel',
    description: 'Eligible -> applied -> interviewed -> offered counts for a drive.',
    category: 'APPLICATIONS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.applications.funnel({ institutionId: user.institutionId, driveId: params.driveId }),
  },
  {
    name: 'get_unapplied_eligible_students',
    description:
      'Cross-module: students who are eligible (readiness + department) but have not applied. Optionally scoped to one drive, one department, and/or a minimum readiness (set minReadiness to isolate "high-readiness unapplied" students).',
    category: 'APPLICATIONS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { driveId: { type: 'string' }, minReadiness: { type: 'number' }, department: { type: 'string' } },
    },
    handler: async (params, { user }) =>
      svc.applications.unappliedEligible({ institutionId: user.institutionId, ...params, department: scopedDept(user, params.department) }),
  },
  {
    name: 'get_application_rate',
    description: 'Application rate (applied / eligible) for a drive.',
    category: 'APPLICATIONS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.applications.rate({ institutionId: user.institutionId, driveId: params.driveId }),
  },
];
