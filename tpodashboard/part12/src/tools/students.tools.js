'use strict';

const svc = require('../services/mockServices');
const { SAFETY_LEVELS } = require('../security/actionSafety');
const { TPO_ROLES, scopedDept } = require('./shared');

module.exports = [
  {
    name: 'search_students',
    description: 'Search students by department, readiness range, or name/ID text.',
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        department: { type: 'string' },
        minReadiness: { type: 'number' },
        maxReadiness: { type: 'number' },
        query: { type: 'string' },
      },
    },
    handler: async (params, { user }) =>
      svc.students.search({ institutionId: user.institutionId, ...params, department: scopedDept(user, params.department) }),
  },
  {
    name: 'get_student',
    description: "Get a single student's profile by ID.",
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'single',
    inputSchema: { type: 'object', required: ['studentId'], additionalProperties: false, properties: { studentId: { type: 'string' } } },
    handler: async (params, { user }) => svc.students.get({ institutionId: user.institutionId, studentId: params.studentId }),
  },
  {
    name: 'get_student_readiness',
    description: "Get a student's current readiness score and available trend history.",
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['studentId'], additionalProperties: false, properties: { studentId: { type: 'string' } } },
    handler: async (params, { user }) => svc.readiness.trend({ institutionId: user.institutionId, studentId: params.studentId }),
  },
  {
    name: 'get_student_applications',
    description: "List a student's drive applications.",
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['studentId'], additionalProperties: false, properties: { studentId: { type: 'string' } } },
    handler: async (params, { user }) => svc.students.applications({ institutionId: user.institutionId, studentId: params.studentId }),
  },
  {
    name: 'get_student_interviews',
    description: "List a student's interview history.",
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['studentId'], additionalProperties: false, properties: { studentId: { type: 'string' } } },
    handler: async (params, { user }) => svc.students.interviews({ institutionId: user.institutionId, studentId: params.studentId }),
  },
  {
    name: 'get_student_offers',
    description: "List a student's offers.",
    category: 'STUDENTS',
    permissions: TPO_ROLES,
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'none',
    inputSchema: { type: 'object', required: ['studentId'], additionalProperties: false, properties: { studentId: { type: 'string' } } },
    handler: async (params, { user }) => svc.students.offers({ institutionId: user.institutionId, studentId: params.studentId }),
  },
];
