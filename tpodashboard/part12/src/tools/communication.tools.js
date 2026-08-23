'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES } = require('./shared');

module.exports = [
  {
    name: 'find_audience',
    description: 'Resolve which students match an outreach criterion (e.g. unapplied + eligible for a drive).',
    category: 'COMMUNICATION',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: { driveId: { type: 'string' }, minReadiness: { type: 'number' } } },
    handler: async (params, { user }) => svc.communication.findAudience({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'prepare_message',
    description: 'Draft a reminder message for a drive audience. Produces a preview only — never sends (safety level PREPARE, no confirmation needed, no side effect).',
    category: 'COMMUNICATION',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.PREPARE,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['driveId'], additionalProperties: false, properties: { driveId: { type: 'string' }, minReadiness: { type: 'number' } } },
    handler: async (params, { user }) => svc.communication.prepareMessage({ institutionId: user.institutionId, ...params }),
  },
  {
    name: 'send_message',
    description: 'Send a prepared message to its audience. SENSITIVE_WRITE — must go through proposeAction/confirmAction; a direct call is refused by the registry.',
    category: 'COMMUNICATION',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.SENSITIVE_WRITE,
    scopeMode: 'none',
    inputSchema: {
      type: 'object',
      required: ['driveId', 'recipientStudentIds', 'body'],
      additionalProperties: false,
      properties: { driveId: { type: 'string' }, recipientStudentIds: { type: 'array' }, body: { type: 'string' } },
    },
    previewHandler: async (params, { user }) => ({
      action: 'Send reminder',
      audienceCount: params.recipientStudentIds.length,
      channel: 'In-app',
      message: params.body,
    }),
    handler: async (params, { user }) =>
      svc.communication.send({ institutionId: user.institutionId, driveId: params.driveId, recipientStudentIds: params.recipientStudentIds, body: params.body }),
  },
  {
    name: 'get_communication_status',
    description: 'Delivery status of a previously sent message.',
    category: 'COMMUNICATION',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['messageId'], additionalProperties: false, properties: { messageId: { type: 'string' } } },
    handler: async (params) => svc.communication.status({ messageId: params.messageId }),
  },
];
