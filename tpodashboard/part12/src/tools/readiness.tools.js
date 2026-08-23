'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES, TPO_AND_MANAGEMENT, scopedDept, scopedDeptReport } = require('./shared');

module.exports = [
  {
    name: 'get_high_risk_students',
    description: 'Students below a readiness threshold (default 45) who may need intervention.',
    category: 'READINESS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { department: { type: 'string' }, threshold: { type: 'number' } } },
    handler: async (params, { user }) =>
      svc.readiness.highRisk({ institutionId: user.institutionId, ...params, department: scopedDept(user, params.department) }),
  },
  {
    name: 'get_top_improvers',
    description: 'Students with the largest observed pre/post training-assessment improvement.',
    category: 'READINESS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { limit: { type: 'number' }, department: { type: 'string' } } },
    handler: async (params, { user }) =>
      svc.readiness.topImprovers({ institutionId: user.institutionId, ...params, department: scopedDept(user, params.department) }),
  },
  {
    name: 'get_department_readiness',
    description: 'Average readiness score per department — the go-to tool for "why is [department] underperforming" or "which department is weakest".',
    category: 'READINESS',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => scopedDeptReport(user, svc.readiness.departmentReadiness({ institutionId: user.institutionId })),
  },
];
