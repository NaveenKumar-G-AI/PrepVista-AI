'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES } = require('./shared');

module.exports = [
  {
    name: 'search_companies',
    description: 'Search recruiting companies by name.',
    category: 'COMPANIES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { query: { type: 'string' } } },
    handler: async (params, { user }) => svc.companies.search({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_company',
    description: 'Get a single company record by ID or exact name.',
    category: 'COMPANIES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'single',
    inputSchema: { type: 'object', additionalProperties: false, properties: { companyId: { type: 'string' }, name: { type: 'string' } } },
    handler: async (params, { user }) => svc.companies.get({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'get_company_history',
    description: "A company's drive history at this institution.",
    category: 'COMPANIES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['companyId'], additionalProperties: false, properties: { companyId: { type: 'string' } } },
    handler: async (params, { user }) => svc.companies.history({ institutionId: user.institutionId, companyId: params.companyId }),
  },
  {
    name: 'get_recruiter_followups',
    description: 'Companies whose recruiter relationship needs a follow-up (new or lapsed contact).',
    category: 'COMPANIES',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.companies.recruiterFollowups({ institutionId: user.institutionId }),
  },
];
