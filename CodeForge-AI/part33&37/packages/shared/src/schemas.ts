/**
 * Shared Zod schemas for API request/response validation.
 * These are the single source of truth for data shapes.
 */
import { z } from 'zod';
import { explainableScoreSchema, weaknessSchema, recommendationSchema } from './types';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/* ---- Auth ---- */
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  role: z.enum(['STUDENT', 'TPO']).optional(),
  collegeId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

/* ---- Student Profile ---- */
export const studentProfileSchema = z.object({
  targetRole: z.string().max(100).optional(),
  targetCompanies: z.array(z.string()).optional(),
  resumeUrl: z.string().url().optional().nullable(),
  skills: z.array(z.string()).optional(),
  experienceLevel: z.enum(['FRESHER', '0-1', '1-2', '2-3', '3-5', '5+']).optional(),
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

/* ---- Assessment ---- */
export const createAssessmentSchema = z.object({
  type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'COMMUNICATION', 'COMBINED']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']).default('MEDIUM'),
  targetRole: z.string().max(100).optional(),
  questionCount: z.number().int().min(1).max(20).default(5),
  timeLimitMinutes: z.number().int().min(5).max(120).default(30),
});

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().min(1).max(10000),
  timeSpentSeconds: z.number().int().positive().optional(),
});

export const assessmentResponseSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'COMMUNICATION', 'COMBINED']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
  status: z.enum(['CREATED', 'IN_PROGRESS', 'COMPLETED', 'PROCESSING', 'FAILED', 'EXPIRED']),
  questions: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
    category: z.string(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
    expectedSkills: z.array(z.string()),
    answer: z.string().nullable(),
    score: z.number().min(0).max(100).nullable(),
    feedback: z.string().nullable(),
  })),
  overallScore: z.number().min(0).max(100).nullable(),
  dimensionScores: explainableScoreSchema.nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/* ---- Intelligence / Recommendations ---- */
export const readinessResponseSchema = z.object({
  studentId: z.string().uuid(),
  overallReadiness: z.number().min(0).max(100),
  dimensionScores: z.array(explainableScoreSchema.shape.dimensions),
  topWeaknesses: z.array(weaknessSchema),
  recommendedActions: z.array(recommendationSchema),
  evidenceConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  assessmentsCompleted: z.number().int().nonnegative(),
  lastAssessmentDate: z.string().datetime().nullable(),
  trendDirection: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA']),
});

/* ---- College/TPO Analytics ---- */
export const collegeAnalyticsSchema = z.object({
  collegeId: z.string().uuid(),
  totalStudents: z.number().int().nonnegative(),
  activeStudents: z.number().int().nonnegative(),
  avgReadiness: z.number().min(0).max(100),
  readinessDistribution: z.object({
    '0-20': z.number().int().nonnegative(),
    '20-40': z.number().int().nonnegative(),
    '40-60': z.number().int().nonnegative(),
    '60-80': z.number().int().nonnegative(),
    '80-100': z.number().int().nonnegative(),
  }),
  topWeaknesses: z.array(z.object({
    skill: z.string(),
    affectedStudents: z.number().int().nonnegative(),
    avgSeverity: z.number().min(1).max(3),
  })),
  completionRate: z.number().min(0).max(100),
  improvementRate: z.number().min(0).max(100),
});

/* ---- Integration (Feature 37) ---- */
export const integrationConfigSchema = z.object({
  webhookUrl: z.string().url(),
  apiBaseUrl: z.string().url().optional(),
  apiVersion: z.string().default('v1'),
  timeoutMs: z.number().int().positive().default(30000),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    baseDelayMs: z.number().int().positive().default(1000),
    maxDelayMs: z.number().int().positive().default(60000),
    backoffMultiplier: z.number().positive().default(2),
  }).optional(),
});

export const createIntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['PREPVISTA']),
  externalId: z.string().max(100).optional(),
  config: integrationConfigSchema,
});

export const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  externalId: z.string().max(100).optional().nullable(),
  config: integrationConfigSchema.partial().optional(),
  status: z.enum(['PENDING', 'CONNECTING', 'ACTIVE', 'DEGRADED', 'DISCONNECTING', 'DISCONNECTED', 'ERROR']).optional(),
});

export const sharingPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.enum(['MINIMAL', 'STANDARD', 'DETAILED', 'FULL'])).min(1),
  defaultScope: z.enum(['MINIMAL', 'STANDARD', 'DETAILED', 'FULL']).default('MINIMAL'),
  studentOptIn: z.boolean().default(false),
  autoApprove: z.boolean().default(false),
  retentionDays: z.number().int().positive().max(2555).default(365), // max 7 years
});

export const organizationMappingSchema = z.object({
  codeforgeCollegeId: z.string().uuid(),
  externalOrgId: z.string().min(1).max(100),
  externalOrgName: z.string().max(200).optional(),
});

export const identityMappingSchema = z.object({
  codeforgeStudentId: z.string().uuid(),
  externalStudentId: z.string().min(1).max(100),
  externalEmail: z.string().email().optional(),
  method: z.enum(['EXTERNAL_ID', 'VERIFIED_EMAIL', 'INSTITUTION_ID', 'ADMIN_MANUAL', 'AUTO_MATCHED']),
});

export const syncJobSchema = z.object({
  type: z.enum(['INITIAL', 'INCREMENTAL', 'FULL_RESYNC', 'SINGLE_STUDENT', 'RECONCILIATION']),
  scope: z.enum(['ALL_ELIGIBLE', 'SPECIFIC_STUDENTS', 'CHANGED_ONLY', 'FAILED_RETRY']),
  studentIds: z.array(z.string().uuid()).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const credentialSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['API_KEY', 'WEBHOOK_SECRET', 'OAUTH_TOKEN', 'OAUTH_REFRESH_TOKEN', 'SERVICE_ACCOUNT_KEY', 'CERTIFICATE']),
  value: z.string().min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

/* ---- Integration Data Contracts (v1) ---- */
export const technicalSkillSchema = z.object({
  skillId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  proficiency: z.number().min(0).max(100).nullable(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  evidenceCount: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
});

export const masteryLevelSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string(),
  level: z.enum(['EMERGING', 'DEVELOPING', 'PROFICIENT', 'ADVANCED', 'EXPERT']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  evidenceSummary: z.string(),
  trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA']),
});

export const roleReadinessSchema = z.object({
  role: z.string(),
  overallReadiness: z.number().min(0).max(100),
  dimensionScores: z.array(z.object({
    dimension: z.enum(['TECHNICAL', 'PROBLEM_SOLVING', 'COMMUNICATION', 'BEHAVIORAL', 'CONFIDENCE', 'ROLE_RELEVANCE']),
    score: z.number().min(0).max(100),
    weight: z.number().positive(),
  })),
  topGaps: z.array(z.object({
    skillId: z.string().uuid(),
    skillName: z.string(),
    currentLevel: z.number().min(0).max(100),
    targetLevel: z.number().min(0).max(100),
    gap: z.number().min(0).max(100),
    priority: z.number().int().min(1).max(10),
  })),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  lastCalculated: z.string().datetime(),
});

export const skillGapSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string(),
  category: z.string(),
  currentProficiency: z.number().min(0).max(100),
  targetProficiency: z.number().min(0).max(100),
  gap: z.number().min(0).max(100),
  severity: z.enum(['CRITICAL', 'MODERATE', 'MILD']),
  recommendedActions: z.array(z.string()),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
});

export const growthSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string(),
  category: z.string(),
  previousProficiency: z.number().min(0).max(100),
  currentProficiency: z.number().min(0).max(100),
  change: z.number().min(-100).max(100),
  periodDays: z.number().int().positive(),
  trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  milestones: z.array(z.object({
    date: z.string().datetime(),
    proficiency: z.number().min(0).max(100),
    eventType: z.string(),
  })).optional(),
});

export const technicalEvidenceSummarySchema = z.object({
  assessmentCount: z.number().int().nonnegative(),
  interviewCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
  totalEvidencePoints: z.number().int().nonnegative(),
  highConfidenceEvidence: z.number().int().nonnegative(),
  skillCoverage: z.number().min(0).max(100), // % of target skills with evidence
  lastEvidenceDate: z.string().datetime().nullable(),
});

export const assessmentSummarySchema = z.object({
  totalAssessments: z.number().int().nonnegative(),
  completedAssessments: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(100).nullable(),
  byType: z.record(z.object({
    count: z.number().int().nonnegative(),
    avgScore: z.number().min(0).max(100).nullable(),
  })),
  recentTrend: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA']),
  lastAssessmentDate: z.string().datetime().nullable(),
});

export const interviewEvidenceSummarySchema = z.object({
  totalInterviews: z.number().int().nonnegative(),
  technicalInterviews: z.number().int().nonnegative(),
  behavioralInterviews: z.number().int().nonnegative(),
  avgTechnicalScore: z.number().min(0).max(100).nullable(),
  avgBehavioralScore: z.number().min(0).max(100).nullable(),
  keyStrengths: z.array(z.string()),
  keyWeaknesses: z.array(z.string()),
  lastInterviewDate: z.string().datetime().nullable(),
});

export const technicalProfileSchema = z.object({
  version: z.string().default('v1'),
  studentId: z.string().uuid(),
  externalStudentId: z.string().optional(),
  organizationId: z.string().uuid(),
  roles: z.array(z.string()),
  skills: z.array(technicalSkillSchema),
  mastery: z.array(masteryLevelSchema),
  gaps: z.array(skillGapSchema),
  readiness: z.array(roleReadinessSchema),
  growth: z.array(growthSchema),
  evidenceSummary: technicalEvidenceSummarySchema,
  assessmentSummary: assessmentSummarySchema,
  interviewEvidenceSummary: interviewEvidenceSummarySchema.optional(),
  metadata: z.object({
    generatedAt: z.string().datetime(),
    dataVersion: z.string(),
    contractVersion: z.string(),
    sharingScope: z.enum(['MINIMAL', 'STANDARD', 'DETAILED', 'FULL']),
  }),
});

export type TechnicalProfile = z.infer<typeof technicalProfileSchema>;

/* ---- Common ---- */
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type IdParam = z.infer<typeof idParamSchema>;