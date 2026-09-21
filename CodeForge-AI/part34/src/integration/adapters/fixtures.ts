// ============================================================================
// EXAMPLE DATA ONLY. Phase 78: "Never use fake production values." Everything
// in this file exists so the reference implementation runs end-to-end without
// a real database, and so tests have something concrete to assert against.
// None of it should ship — real adapters replace all of this.
// ============================================================================

import {
  asEvidenceSourceId,
  asOrgId,
  asRoleId,
  asSkillId,
  asStudentId,
  type OrgId,
  type RoleContext,
  type RoleId,
  type StudentEvidenceContext,
  type StudentId,
} from "../../domain/types.js";
import type { ComplexityAnalysisSummary, MasterySnapshot, ReadinessSnapshot, SkillGapSummary } from "../ports.js";

export const EXAMPLE_ORG_ID: OrgId = asOrgId("org_example_college");
export const EXAMPLE_ROLE_ID: RoleId = asRoleId("role_backend_engineer");
export const EXAMPLE_STUDENT_ID: StudentId = asStudentId("student_example_ada");

export const SKILL_PYTHON = asSkillId("skill_python");
export const SKILL_SQL = asSkillId("skill_sql");
export const SKILL_SYSTEM_DESIGN = asSkillId("skill_system_design");
export const SKILL_DEBUGGING = asSkillId("skill_debugging");
export const SKILL_REST_APIS = asSkillId("skill_rest_apis");
export const SKILL_TESTING = asSkillId("skill_testing");

const ROLE_CONTEXTS: Record<string, RoleContext> = {
  [EXAMPLE_ROLE_ID]: {
    roleId: EXAMPLE_ROLE_ID,
    roleName: "Backend Engineer",
    roleModelVersion: "role-model-2026.3",
    skills: [
      { skillId: SKILL_PYTHON, skillName: "Python", importance: "CORE", targetMastery: 0.7 },
      { skillId: SKILL_SQL, skillName: "SQL", importance: "CORE", targetMastery: 0.65 },
      { skillId: SKILL_REST_APIS, skillName: "REST APIs", importance: "CORE", targetMastery: 0.65 },
      { skillId: SKILL_SYSTEM_DESIGN, skillName: "System Design", importance: "IMPORTANT", targetMastery: 0.5, dependsOn: [SKILL_REST_APIS] },
      { skillId: SKILL_DEBUGGING, skillName: "Debugging", importance: "IMPORTANT", targetMastery: 0.6 },
      { skillId: SKILL_TESTING, skillName: "Testing", importance: "SUPPORTING", targetMastery: 0.4 },
    ],
  },
};

export function lookupRoleContext(roleId: RoleId): RoleContext {
  const found = ROLE_CONTEXTS[roleId];
  if (!found) throw new Error(`No example role context for roleId="${roleId}". Add one to fixtures.ts.`);
  return found;
}

const STUDENT_EVIDENCE: Record<string, StudentEvidenceContext> = {
  [EXAMPLE_STUDENT_ID]: {
    studentId: EXAMPLE_STUDENT_ID,
    perSkill: {
      [SKILL_PYTHON]: {
        skillId: SKILL_PYTHON,
        evidenceState: "VERIFIED",
        confidence: 0.82,
        sources: [
          {
            sourceType: "CODING_CHALLENGE",
            sourceId: asEvidenceSourceId("ch_101"),
            description: "12 Python challenges, 91% pass rate",
            capturedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        lastUpdated: "2026-07-01T00:00:00.000Z",
      },
      [SKILL_SQL]: {
        skillId: SKILL_SQL,
        evidenceState: "PARTIALLY_VERIFIED",
        confidence: 0.48,
        sources: [],
        lastUpdated: "2026-06-20T00:00:00.000Z",
      },
      [SKILL_SYSTEM_DESIGN]: {
        skillId: SKILL_SYSTEM_DESIGN,
        evidenceState: "UNCERTAIN",
        confidence: 0.2,
        sources: [],
        lastUpdated: "2026-05-11T00:00:00.000Z",
      },
      [SKILL_REST_APIS]: {
        skillId: SKILL_REST_APIS,
        evidenceState: "PARTIALLY_VERIFIED",
        confidence: 0.55,
        sources: [],
        lastUpdated: "2026-07-10T00:00:00.000Z",
      },
    },
    projectContext: {
      projectId: asEvidenceSourceId("proj_task_api"),
      title: "Task Management REST API",
      verifiedComponents: [
        "Express REST API with 6 endpoints",
        "PostgreSQL schema with users/tasks/tags tables",
        "JWT-based authentication middleware",
      ],
      codeExcerpts: [
        {
          id: "excerpt_auth_middleware",
          filePath: "src/middleware/auth.js",
          language: "javascript",
          startLine: 1,
          endLine: 14,
          content:
            "function requireAuth(req, res, next) {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'missing token' });\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET);\n    next();\n  } catch (err) {\n    return res.status(401).json({ error: 'invalid token' });\n  }\n}",
          relatedSkillIds: [SKILL_REST_APIS],
        },
        {
          id: "excerpt_task_list_n_plus_1",
          filePath: "src/routes/tasks.js",
          language: "javascript",
          startLine: 22,
          endLine: 31,
          content:
            "router.get('/tasks', requireAuth, async (req, res) => {\n  const tasks = await Task.findAll({ where: { userId: req.user.id } });\n  for (const task of tasks) {\n    task.tags = await Tag.findAll({ where: { taskId: task.id } });\n  }\n  res.json(tasks);\n});",
          relatedSkillIds: [SKILL_SQL, SKILL_SYSTEM_DESIGN],
        },
      ],
    },
  },
};

export function lookupStudentEvidence(studentId: StudentId): StudentEvidenceContext {
  const found = STUDENT_EVIDENCE[studentId];
  if (!found) {
    return { studentId, perSkill: {} };
  }
  return found;
}

export const EXAMPLE_MASTERY: Record<string, MasterySnapshot> = {
  [`${EXAMPLE_STUDENT_ID}:${SKILL_PYTHON}`]: { skillId: SKILL_PYTHON, masteryLevel: 0.74, label: "Proficient", lastUpdated: "2026-07-01T00:00:00.000Z" },
};

export const EXAMPLE_GAPS: SkillGapSummary[] = [
  { skillId: SKILL_SYSTEM_DESIGN, gapState: "UNCERTAIN", priority: "HIGH" },
  { skillId: SKILL_SQL, gapState: "DEVELOPING", priority: "MEDIUM" },
];

export const EXAMPLE_READINESS: ReadinessSnapshot = {
  roleId: EXAMPLE_ROLE_ID,
  readinessScore: 0.58,
  label: "Developing",
};

export const EXAMPLE_COMPLEXITY: Record<string, ComplexityAnalysisSummary> = {
  excerpt_task_list_n_plus_1: {
    submissionId: "excerpt_task_list_n_plus_1",
    timeComplexity: "O(n) round trips (N+1 query pattern)",
    spaceComplexity: "O(n)",
    confidence: "HIGH",
  },
};
