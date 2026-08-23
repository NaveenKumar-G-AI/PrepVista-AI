'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES } = require('./shared');

module.exports = [
  {
    name: 'search_drives',
    description: 'Search placement drives, optionally by status (e.g. "open").',
    category: 'DRIVES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string' } } },
    handler: async (params, { user }) => svc.drives.search({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_drive',
    description: 'Get a single drive by ID.',
    category: 'DRIVES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'single',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.drives.get({ institutionId: user.institutionId, driveId: params.driveId }),
  },
  {
    name: 'get_drive_health',
    description: 'Eligibility, application rate, deadline risk, and unapplied count for a drive — the go-to tool for "what is wrong with this drive?".',
    category: 'DRIVES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.drives.health({ institutionId: user.institutionId, driveId: params.driveId }),
  },
  {
    name: 'get_drive_eligibility',
    description: 'List students eligible for a drive by department + minimum readiness criteria.',
    category: 'DRIVES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' } } },
    handler: async (params, { user }) => svc.drives.eligibleStudents({ institutionId: user.institutionId, driveId: params.driveId }),
  },
];
