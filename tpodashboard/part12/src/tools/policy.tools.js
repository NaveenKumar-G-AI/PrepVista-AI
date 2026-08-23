'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_AND_MANAGEMENT, ROLES } = require('./shared');

module.exports = [
  {
    name: 'get_active_policy',
    description: "The institution's active season policy (multiple-offer rules, withdrawal rules).",
    category: 'POLICIES',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.policy.active({ institutionId: user.institutionId }),
  },
  {
    name: 'get_ai_action_policy',
    description: 'Institution-configured policy for which AI actions require confirmation or approval.',
    category: 'POLICIES',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.policy.aiActionPolicy({ institutionId: user.institutionId }),
  },
  {
    name: 'get_data_quality',
    description: 'Data-quality summary (e.g. unverified joining records) — use before treating a metric as final.',
    category: 'DATA_QUALITY',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.dataQuality.summary({ institutionId: user.institutionId }),
  },
  {
    name: 'get_critical_data_issues',
    description: 'Only the data-quality issues severe enough to affect report reliability.',
    category: 'DATA_QUALITY',
    permissions: TPO_AND_MANAGEMENT,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async (_params, { user }) => svc.dataQuality.criticalIssues({ institutionId: user.institutionId }),
  },
  {
    name: 'get_ai_audit_summary',
    description: 'Recent AI audit events for this institution (tool calls, denials, actions). Admin-only introspection.',
    category: 'AUDIT',
    permissions: [ROLES.TPO_ADMIN],
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', additionalProperties: false, properties: { limit: { type: 'number' } } },
    handler: async (params, { user, context }) => {
      if (!context.auditLog) return { items: [], note: 'No audit log wired into this call context.' };
      return { items: context.auditLog.list({ limit: params.limit || 25 }) };
    },
  },
];
