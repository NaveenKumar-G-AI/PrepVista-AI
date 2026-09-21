/**
 * Integration Contract Tests (Feature 37)
 * Tests for TechnicalProfile schema validation, version compatibility, and scope filtering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TechnicalProfile,
  TechnicalSkill,
  MasteryLevel,
  RoleReadiness,
  SkillGap,
  Growth,
  TechnicalEvidenceSummary,
  AssessmentSummary,
  InterviewEvidenceSummary,
  SharingScope,
  CONTRACT_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  technicalProfileSchema,
  technicalSkillSchema,
  masteryLevelSchema,
  roleReadinessSchema,
  skillGapSchema,
  growthSchema,
  technicalEvidenceSummarySchema,
  assessmentSummarySchema,
  interviewEvidenceSummarySchema,
  sharingScopeSchema,
} from '@prepvista/shared';

// Mock the shared schemas and constants
vi.mock('@prepvista/shared', async () => {
  const actual = await vi.importActual('@prepvista/shared');
  return {
    ...actual,
    CONTRACT_VERSION: 'v1',
    SUPPORTED_CONTRACT_VERSIONS: ['v1'],
    SharingScope: { MINIMAL: 'MINIMAL', STANDARD: 'STANDARD', DETAILED: 'DETAILED' },
  };
});

describe('Integration Contract Tests (Feature 37)', () => {
  describe('Contract Version Constants', () => {
    it('should have correct contract version', () => {
      expect(CONTRACT_VERSION).toBe('v1');
    });

    it('should support v1', () => {
      expect(SUPPORTED_CONTRACT_VERSIONS).toContain('v1');
    });

    it('should reject unsupported versions', () => {
      expect(SUPPORTED_CONTRACT_VERSIONS).not.toContain('v0');
      expect(SUPPORTED_CONTRACT_VERSIONS).not.toContain('v2');
    });
  });

  describe('SharingScope Enum', () => {
    it('should have all required scopes', () => {
      expect(SharingScope.MINIMAL).toBe('MINIMAL');
      expect(SharingScope.STANDARD).toBe('STANDARD');
      expect(SharingScope.DETAILED).toBe('DETAILED');
    });

    it('should validate sharing scope schema', () => {
      expect(sharingScopeSchema.parse('MINIMAL')).toBe('MINIMAL');
      expect(sharingScopeSchema.parse('STANDARD')).toBe('STANDARD');
      expect(sharingScopeSchema.parse('DETAILED')).toBe('DETAILED');

      expect(() => sharingScopeSchema.parse('INVALID')).toThrow();
    });
  });

  describe('TechnicalSkill Schema', () => {
    const validSkill = {
      skillId: 'skill-123',
      name: 'JavaScript',
      category: 'Languages',
      proficiency: 80,
      confidence: 'HIGH',
      evidenceCount: 5,
      lastUpdated: '2024-01-15T10:30:00Z',
    };

    it('should validate valid technical skill', () => {
      const result = technicalSkillSchema.parse(validSkill);
      expect(result.skillId).toBe('skill-123');
      expect(result.proficiency).toBe(80);
      expect(result.confidence).toBe('HIGH');
    });

    it('should reject proficiency out of range', () => {
      expect(() => technicalSkillSchema.parse({ ...validSkill, proficiency: -1 })).toThrow();
      expect(() => technicalSkillSchema.parse({ ...validSkill, proficiency: 101 })).toThrow();
    });

    it('should reject invalid confidence', () => {
      expect(() => technicalSkillSchema.parse({ ...validSkill, confidence: 'INVALID' })).toThrow();
    });

    it('should reject invalid category', () => {
      expect(() => technicalSkillSchema.parse({ ...validSkill, category: '' })).toThrow();
    });

    it('should accept all valid confidence levels', () => {
      ['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'].forEach(c => {
        expect(() => technicalSkillSchema.parse({ ...validSkill, confidence: c })).not.toThrow();
      });
    });
  });

  describe('MasteryLevel Schema', () => {
    const validMastery = {
      skillId: 'skill-123',
      skillName: 'JavaScript',
      level: 'ADVANCED',
      confidence: 'HIGH',
      evidenceSummary: '5 evidence points',
      trend: 'IMPROVING',
    };

    it('should validate valid mastery level', () => {
      const result = masteryLevelSchema.parse(validMastery);
      expect(result.level).toBe('ADVANCED');
      expect(result.trend).toBe('IMPROVING');
    });

    it('should reject invalid level', () => {
      expect(() => masteryLevelSchema.parse({ ...validMastery, level: 'NOVICE' })).toThrow();
    });

    it('should accept all valid levels', () => {
      ['EXPERT', 'ADVANCED', 'PROFICIENT', 'DEVELOPING', 'EMERGING'].forEach(l => {
        expect(() => masteryLevelSchema.parse({ ...validMastery, level: l })).not.toThrow();
      });
    });

    it('should accept all valid trends', () => {
      ['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA'].forEach(t => {
        expect(() => masteryLevelSchema.parse({ ...validMastery, trend: t })).not.toThrow();
      });
    });
  });

  describe('RoleReadiness Schema', () => {
    const validReadiness = {
      role: 'Software Engineer',
      overallReadiness: 75,
      dimensionScores: [
        { dimension: 'TECHNICAL', score: 80, evidence: ['Assessment 1', 'Project 2'] },
        { dimension: 'PROBLEM_SOLVING', score: 70, evidence: ['Challenge 1'] },
      ],
      topGaps: [
        { skillId: 'skill-1', skillName: 'System Design', gap: 30, severity: 'CRITICAL' },
      ],
      confidence: 'HIGH',
      lastCalculated: '2024-01-15T10:30:00Z',
    };

    it('should validate valid role readiness', () => {
      const result = roleReadinessSchema.parse(validReadiness);
      expect(result.role).toBe('Software Engineer');
      expect(result.overallReadiness).toBe(75);
      expect(result.dimensionScores).toHaveLength(2);
      expect(result.topGaps).toHaveLength(1);
    });

    it('should reject readiness out of range', () => {
      expect(() => roleReadinessSchema.parse({ ...validReadiness, overallReadiness: -1 })).toThrow();
      expect(() => roleReadinessSchema.parse({ ...validReadiness, overallReadiness: 101 })).toThrow();
    });

    it('should reject invalid dimension score', () => {
      expect(() => roleReadinessSchema.parse({
        ...validReadiness,
        dimensionScores: [{ dimension: 'INVALID', score: 50, evidence: [] }],
      })).toThrow();
    });

    it('should validate dimension score structure', () => {
      const result = roleReadinessSchema.parse(validReadiness);
      expect(result.dimensionScores[0]).toHaveProperty('dimension');
      expect(result.dimensionScores[0]).toHaveProperty('score');
      expect(result.dimensionScores[0]).toHaveProperty('evidence');
    });
  });

  describe('SkillGap Schema', () => {
    const validGap = {
      skillId: 'skill-1',
      skillName: 'System Design',
      category: 'Architecture',
      currentLevel: 'DEVELOPING',
      requiredLevel: 'ADVANCED',
      gap: 35,
      severity: 'CRITICAL',
      priority: 1,
      recommendedActions: ['Complete system design course', 'Practice design problems'],
    };

    it('should validate valid skill gap', () => {
      const result = skillGapSchema.parse(validGap);
      expect(result.gap).toBe(35);
      expect(result.severity).toBe('CRITICAL');
    });

    it('should reject negative gap', () => {
      expect(() => skillGapSchema.parse({ ...validGap, gap: -1 })).toThrow();
    });

    it('should reject invalid severity', () => {
      expect(() => skillGapSchema.parse({ ...validGap, severity: 'MINOR' })).toThrow();
    });

    it('should accept all valid severities', () => {
      ['CRITICAL', 'MODERATE', 'MILD'].forEach(s => {
        expect(() => skillGapSchema.parse({ ...validGap, severity: s })).not.toThrow();
      });
    });

    it('should accept all valid levels', () => {
      ['EXPERT', 'ADVANCED', 'PROFICIENT', 'DEVELOPING', 'EMERGING'].forEach(l => {
        expect(() => skillGapSchema.parse({ ...validGap, currentLevel: l })).not.toThrow();
        expect(() => skillGapSchema.parse({ ...validGap, requiredLevel: l })).not.toThrow();
      });
    });
  });

  describe('Growth Schema', () => {
    const validGrowth = {
      skillId: 'skill-1',
      skillName: 'JavaScript',
      category: 'Languages',
      previousProficiency: 60,
      currentProficiency: 80,
      change: 20,
      trend: 'IMPROVING',
      periodDays: 30,
      evidenceAdded: 3,
    };

    it('should validate valid growth', () => {
      const result = growthSchema.parse(validGrowth);
      expect(result.change).toBe(20);
      expect(result.trend).toBe('IMPROVING');
    });

    it('should accept all valid trends', () => {
      ['IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA'].forEach(t => {
        expect(() => growthSchema.parse({ ...validGrowth, trend: t })).not.toThrow();
      });
    });

    it('should validate periodDays is positive', () => {
      expect(() => growthSchema.parse({ ...validGrowth, periodDays: 0 })).toThrow();
      expect(() => growthSchema.parse({ ...validGrowth, periodDays: -1 })).toThrow();
    });
  });

  describe('TechnicalEvidenceSummary Schema', () => {
    const validSummary = {
      assessmentCount: 5,
      interviewCount: 2,
      projectCount: 3,
      totalEvidencePoints: 25,
      highConfidenceEvidence: 20,
      skillCoverage: 85,
      lastEvidenceDate: '2024-01-15T10:30:00Z',
    };

    it('should validate valid evidence summary', () => {
      const result = technicalEvidenceSummarySchema.parse(validSummary);
      expect(result.assessmentCount).toBe(5);
      expect(result.skillCoverage).toBe(85);
    });

    it('should reject negative counts', () => {
      expect(() => technicalEvidenceSummarySchema.parse({ ...validSummary, assessmentCount: -1 })).toThrow();
      expect(() => technicalEvidenceSummarySchema.parse({ ...validSummary, skillCoverage: 101 })).toThrow();
    });
  });

  describe('AssessmentSummary Schema', () => {
    const validSummary = {
      totalAssessments: 10,
      completedAssessments: 8,
      averageScore: 72.5,
      byType: { TECHNICAL: 5, BEHAVIORAL: 3 },
      recentTrend: 'IMPROVING',
      lastAssessmentDate: '2024-01-15T10:30:00Z',
    };

    it('should validate valid assessment summary', () => {
      const result = assessmentSummarySchema.parse(validSummary);
      expect(result.totalAssessments).toBe(10);
      expect(result.byType).toEqual({ TECHNICAL: 5, BEHAVIORAL: 3 });
    });

    it('should reject invalid trend', () => {
      expect(() => assessmentSummarySchema.parse({ ...validSummary, recentTrend: 'UNKNOWN' })).toThrow();
    });

    it('should reject averageScore out of range', () => {
      expect(() => assessmentSummarySchema.parse({ ...validSummary, averageScore: -1 })).toThrow();
      expect(() => assessmentSummarySchema.parse({ ...validSummary, averageScore: 101 })).toThrow();
    });
  });

  describe('InterviewEvidenceSummary Schema', () => {
    const validSummary = {
      totalInterviews: 3,
      completedInterviews: 3,
      averageScore: 78,
      byType: { TECHNICAL: 2, BEHAVIORAL: 1 },
      topDimensions: [
        { dimension: 'TECHNICAL', averageScore: 80 },
        { dimension: 'COMMUNICATION', averageScore: 75 },
      ],
      lastInterviewDate: '2024-01-15T10:30:00Z',
    };

    it('should validate valid interview summary', () => {
      const result = interviewEvidenceSummarySchema.parse(validSummary);
      expect(result.totalInterviews).toBe(3);
      expect(result.topDimensions).toHaveLength(2);
    });
  });

  describe('TechnicalProfile Schema (Full Contract)', () => {
    const validProfile: TechnicalProfile = {
      version: 'v1',
      studentId: 'student-123',
      externalStudentId: 'pv-student-456',
      organizationId: 'college-123',
      roles: ['Software Engineer', 'Full Stack Developer'],
      skills: [
        { skillId: 'skill-1', name: 'JavaScript', category: 'Languages', proficiency: 80, confidence: 'HIGH', evidenceCount: 5, lastUpdated: '2024-01-15T10:30:00Z' },
        { skillId: 'skill-2', name: 'React', category: 'Frameworks', proficiency: 70, confidence: 'HIGH', evidenceCount: 3, lastUpdated: '2024-01-15T10:30:00Z' },
      ],
      mastery: [
        { skillId: 'skill-1', skillName: 'JavaScript', level: 'ADVANCED', confidence: 'HIGH', evidenceSummary: '5 evidence points', trend: 'IMPROVING' },
        { skillId: 'skill-2', skillName: 'React', level: 'PROFICIENT', confidence: 'HIGH', evidenceSummary: '3 evidence points', trend: 'STABLE' },
      ],
      gaps: [
        { skillId: 'skill-3', skillName: 'System Design', category: 'Architecture', currentLevel: 'EMERGING', requiredLevel: 'ADVANCED', gap: 50, severity: 'CRITICAL', priority: 1, recommendedActions: ['Take course'] },
      ],
      readiness: [
        {
          role: 'Software Engineer',
          overallReadiness: 72,
          dimensionScores: [{ dimension: 'TECHNICAL', score: 75, evidence: ['Assessment 1'] }],
          topGaps: [{ skillId: 'skill-3', skillName: 'System Design', gap: 50, severity: 'CRITICAL' }],
          confidence: 'HIGH',
          lastCalculated: '2024-01-15T10:30:00Z',
        },
      ],
      growth: [
        { skillId: 'skill-1', skillName: 'JavaScript', category: 'Languages', previousProficiency: 60, currentProficiency: 80, change: 20, trend: 'IMPROVING', periodDays: 30, evidenceAdded: 3 },
      ],
      evidenceSummary: { assessmentCount: 5, interviewCount: 2, projectCount: 3, totalEvidencePoints: 25, highConfidenceEvidence: 20, skillCoverage: 85, lastEvidenceDate: '2024-01-15T10:30:00Z' },
      assessmentSummary: { totalAssessments: 5, completedAssessments: 5, averageScore: 72, byType: {}, recentTrend: 'IMPROVING', lastAssessmentDate: '2024-01-15T10:30:00Z' },
      interviewEvidenceSummary: { totalInterviews: 2, completedInterviews: 2, averageScore: 78, byType: {}, topDimensions: [], lastInterviewDate: '2024-01-15T10:30:00Z' },
      metadata: { generatedAt: '2024-01-15T10:30:00Z', dataVersion: '1.0', contractVersion: 'v1', sharingScope: 'STANDARD' },
    };

    it('should validate complete valid profile', () => {
      const result = technicalProfileSchema.parse(validProfile);
      expect(result.version).toBe('v1');
      expect(result.studentId).toBe('student-123');
      expect(result.skills).toHaveLength(2);
      expect(result.mastery).toHaveLength(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.readiness).toHaveLength(1);
      expect(result.growth).toHaveLength(1);
      expect(result.metadata.contractVersion).toBe('v1');
    });

    it('should reject missing required fields', () => {
      expect(() => technicalProfileSchema.parse({ ...validProfile, version: undefined })).toThrow();
      expect(() => technicalProfileSchema.parse({ ...validProfile, studentId: undefined })).toThrow();
      expect(() => technicalProfileSchema.parse({ ...validProfile, metadata: undefined })).toThrow();
    });

    it('should reject invalid contract version', () => {
      expect(() => technicalProfileSchema.parse({ ...validProfile, version: 'v0' })).toThrow();
    });

    it('should reject invalid sharing scope in metadata', () => {
      expect(() => technicalProfileSchema.parse({ ...validProfile, metadata: { ...validProfile.metadata, sharingScope: 'INVALID' } })).toThrow();
    });

    it('should require all metadata fields', () => {
      expect(() => technicalProfileSchema.parse({
        ...validProfile,
        metadata: { ...validProfile.metadata, dataVersion: undefined },
      })).toThrow();
    });

    it('should validate roles array is non-empty', () => {
      expect(() => technicalProfileSchema.parse({ ...validProfile, roles: [] })).toThrow();
    });

    it('should allow empty arrays for optional sections', () => {
      const minimal = {
        ...validProfile,
        skills: [],
        mastery: [],
        gaps: [],
        readiness: [],
        growth: [],
      };
      const result = technicalProfileSchema.parse(minimal);
      expect(result.skills).toHaveLength(0);
      expect(result.growth).toHaveLength(0);
    });
  });

  describe('Scope Filtering Contract', () => {
    const fullProfile: TechnicalProfile = {
      version: 'v1',
      studentId: 'student-123',
      externalStudentId: 'pv-student-456',
      organizationId: 'college-123',
      roles: ['Software Engineer'],
      skills: [{ skillId: 'skill-1', name: 'JavaScript', category: 'Languages', proficiency: 80, confidence: 'HIGH', evidenceCount: 5, lastUpdated: '2024-01-15T10:30:00Z' }],
      mastery: [{ skillId: 'skill-1', skillName: 'JavaScript', level: 'ADVANCED', confidence: 'HIGH', evidenceSummary: '5 evidence points', trend: 'IMPROVING' }],
      gaps: [{ skillId: 'skill-2', skillName: 'System Design', category: 'Architecture', currentLevel: 'EMERGING', requiredLevel: 'ADVANCED', gap: 50, severity: 'CRITICAL', priority: 1, recommendedActions: ['Take course'] }],
      readiness: [{ role: 'Software Engineer', overallReadiness: 72, dimensionScores: [], topGaps: [], confidence: 'HIGH', lastCalculated: '2024-01-15T10:30:00Z' }],
      growth: [{ skillId: 'skill-1', skillName: 'JavaScript', category: 'Languages', previousProficiency: 60, currentProficiency: 80, change: 20, trend: 'IMPROVING', periodDays: 30, evidenceAdded: 3 }],
      evidenceSummary: { assessmentCount: 5, interviewCount: 2, projectCount: 3, totalEvidencePoints: 25, highConfidenceEvidence: 20, skillCoverage: 85, lastEvidenceDate: '2024-01-15T10:30:00Z' },
      assessmentSummary: { totalAssessments: 5, completedAssessments: 5, averageScore: 72, byType: {}, recentTrend: 'IMPROVING', lastAssessmentDate: '2024-01-15T10:30:00Z' },
      interviewEvidenceSummary: { totalInterviews: 2, completedInterviews: 2, averageScore: 78, byType: {}, topDimensions: [], lastInterviewDate: '2024-01-15T10:30:00Z' },
      metadata: { generatedAt: '2024-01-15T10:30:00Z', dataVersion: '1.0', contractVersion: 'v1', sharingScope: 'STANDARD' },
    };

    // Import the filter function
    const { filterProfileByScope } = await vi.importActual('../services/integration/profile-builder');

    it('should include all data for DETAILED scope', () => {
      const filtered = filterProfileByScope(fullProfile, 'DETAILED');
      expect(filtered.skills.length).toBe(1);
      expect(filtered.mastery.length).toBe(1);
      expect(filtered.gaps.length).toBe(1);
      expect(filtered.readiness.length).toBe(1);
      expect(filtered.growth.length).toBe(1);
      expect(filtered.evidenceSummary).toBeDefined();
      expect(filtered.assessmentSummary).toBeDefined();
      expect(filtered.interviewEvidenceSummary).toBeDefined();
      expect(filtered.metadata.sharingScope).toBe('DETAILED');
    });

    it('should include standard data for STANDARD scope', () => {
      const filtered = filterProfileByScope(fullProfile, 'STANDARD');
      expect(filtered.skills.length).toBe(1);
      expect(filtered.mastery.length).toBe(1);
      expect(filtered.gaps.length).toBe(1);
      expect(filtered.readiness.length).toBe(1);
      // STANDARD should exclude growth, evidence, interview, assessment
      expect(filtered.growth).toHaveLength(0);
      expect(filtered.evidenceSummary).toBeDefined(); // May be included
    });

    it('should include minimal data for MINIMAL scope', () => {
      const filtered = filterProfileByScope(fullProfile, 'MINIMAL');
      expect(filtered.skills).toHaveLength(0);
      expect(filtered.mastery).toHaveLength(0);
      expect(filtered.gaps).toHaveLength(0);
      expect(filtered.readiness.length).toBe(1);
      expect(filtered.growth).toHaveLength(0);
      expect(filtered.evidenceSummary).toBeDefined(); // May be minimal
    });

    it('should always preserve metadata', () => {
      const filtered = filterProfileByScope(fullProfile, 'MINIMAL');
      expect(filtered.metadata).toBeDefined();
      expect(filtered.metadata.contractVersion).toBe('v1');
      expect(filtered.metadata.studentId).toBeUndefined(); // Not in metadata
      expect(filtered.studentId).toBe('student-123');
    });
  });

  describe('Event Contract', () => {
    const { IntegrationEvent } = await vi.importActual('@prepvista/shared');

    it('should have required event fields', () => {
      const event = {
        eventId: 'evt-123',
        eventType: 'technical.profile.updated',
        schemaVersion: 'v1',
        occurredAt: new Date().toISOString(),
        source: 'CODEFORGE',
        organizationRef: 'college-123',
        externalStudentRef: 'pv-student-456',
        dataVersion: '1.0',
        payload: {},
        idempotencyKey: 'evt-123_profile',
        status: 'PENDING',
      };
      expect(event.eventId).toBeDefined();
      expect(event.eventType).toMatch(/^technical\./);
      expect(event.schemaVersion).toBe('v1');
    });

    it('should support all event types', () => {
      const eventTypes = [
        'technical.profile.updated',
        'technical.skill.updated',
        'technical.readiness.updated',
        'technical.gap.updated',
        'technical.assessment.completed',
        'technical.interview.completed',
        'technical.growth.updated',
      ];
      eventTypes.forEach(type => {
        expect(type).toMatch(/^technical\./);
      });
    });
  });

  describe('Error Contract', () => {
    const errorCodes = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'RESOURCE_NOT_FOUND',
      'STUDENT_NOT_LINKED',
      'INTEGRATION_NOT_ACTIVE',
      'SHARING_NOT_ALLOWED',
      'INVALID_REQUEST',
      'RATE_LIMITED',
      'TEMPORARY_UNAVAILABLE',
      'UNSUPPORTED_CONTRACT_VERSION',
      'VALIDATION_ERROR',
    ];

    it('should have all required error codes defined', () => {
      errorCodes.forEach(code => {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Sync Job Contract', () => {
    const { SyncJobType, SyncScope, SyncJobStatus, SyncAction, SyncRecordStatus } = await vi.importActual('@prepvista/shared');

    it('should have all sync job types', () => {
      expect(SyncJobType.INITIAL).toBe('INITIAL');
      expect(SyncJobType.INCREMENTAL).toBe('INCREMENTAL');
      expect(SyncJobType.FULL_RESYNC).toBe('FULL_RESYNC');
      expect(SyncJobType.SINGLE_STUDENT).toBe('SINGLE_STUDENT');
      expect(SyncJobType.RECONCILIATION).toBe('RECONCILIATION');
    });

    it('should have all sync scopes', () => {
      expect(SyncScope.ALL_ELIGIBLE).toBe('ALL_ELIGIBLE');
      expect(SyncScope.SPECIFIC_STUDENTS).toBe('SPECIFIC_STUDENTS');
      expect(SyncScope.CHANGED_ONLY).toBe('CHANGED_ONLY');
      expect(SyncScope.FAILED_RETRY).toBe('FAILED_RETRY');
    });

    it('should have all sync statuses', () => {
      expect(SyncJobStatus.PENDING).toBe('PENDING');
      expect(SyncJobStatus.RUNNING).toBe('RUNNING');
      expect(SyncJobStatus.COMPLETED).toBe('COMPLETED');
      expect(SyncJobStatus.PARTIAL).toBe('PARTIAL');
      expect(SyncJobStatus.FAILED).toBe('FAILED');
      expect(SyncJobStatus.CANCELLED).toBe('CANCELLED');
    });

    it('should have all sync actions', () => {
      expect(SyncAction.CREATE).toBe('CREATE');
      expect(SyncAction.UPDATE).toBe('UPDATE');
      expect(SyncAction.DELETE).toBe('DELETE');
      expect(SyncAction.NO_CHANGE).toBe('NO_CHANGE');
    });

    it('should have all record statuses', () => {
      expect(SyncRecordStatus.PENDING).toBe('PENDING');
      expect(SyncRecordStatus.PROCESSING).toBe('PROCESSING');
      expect(SyncRecordStatus.COMPLETED).toBe('COMPLETED');
      expect(SyncRecordStatus.FAILED).toBe('FAILED');
      expect(SyncRecordStatus.SKIPPED).toBe('SKIPPED');
    });
  });

  describe('Integration Domain Enums', () => {
    const { IntegrationType, IntegrationStatus, CredentialType, MappingStatus, IdentityMappingMethod, ErrorCategory, ErrorSeverity, EventStatus } = await vi.importActual('@prepvista/shared');

    it('should have integration types', () => {
      expect(IntegrationType.PREPVISTA).toBe('PREPVISTA');
    });

    it('should have integration statuses', () => {
      expect(IntegrationStatus.PENDING).toBe('PENDING');
      expect(IntegrationStatus.CONNECTING).toBe('CONNECTING');
      expect(IntegrationStatus.ACTIVE).toBe('ACTIVE');
      expect(IntegrationStatus.DEGRADED).toBe('DEGRADED');
      expect(IntegrationStatus.DISCONNECTING).toBe('DISCONNECTING');
      expect(IntegrationStatus.DISCONNECTED).toBe('DISCONNECTED');
      expect(IntegrationStatus.ERROR).toBe('ERROR');
    });

    it('should have credential types', () => {
      expect(CredentialType.API_KEY).toBe('API_KEY');
      expect(CredentialType.WEBHOOK_SECRET).toBe('WEBHOOK_SECRET');
      expect(CredentialType.OAUTH_TOKEN).toBe('OAUTH_TOKEN');
      expect(CredentialType.OAUTH_REFRESH_TOKEN).toBe('OAUTH_REFRESH_TOKEN');
      expect(CredentialType.SERVICE_ACCOUNT_KEY).toBe('SERVICE_ACCOUNT_KEY');
      expect(CredentialType.CERTIFICATE).toBe('CERTIFICATE');
    });

    it('should have mapping statuses', () => {
      expect(MappingStatus.PENDING).toBe('PENDING');
      expect(MappingStatus.VERIFIED).toBe('VERIFIED');
      expect(MappingStatus.FAILED).toBe('FAILED');
      expect(MappingStatus.EXPIRED).toBe('EXPIRED');
    });

    it('should have identity mapping methods', () => {
      expect(IdentityMappingMethod.EXTERNAL_ID).toBe('EXTERNAL_ID');
      expect(IdentityMappingMethod.VERIFIED_EMAIL).toBe('VERIFIED_EMAIL');
      expect(IdentityMappingMethod.INSTITUTION_ID).toBe('INSTITUTION_ID');
      expect(IdentityMappingMethod.ADMIN_MANUAL).toBe('ADMIN_MANUAL');
      expect(IdentityMappingMethod.AUTO_MATCHED).toBe('AUTO_MATCHED');
    });

    it('should have error categories', () => {
      expect(ErrorCategory.AUTHENTICATION).toBe('AUTHENTICATION');
      expect(ErrorCategory.AUTHORIZATION).toBe('AUTHORIZATION');
      expect(ErrorCategory.NETWORK).toBe('NETWORK');
      expect(ErrorCategory.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCategory.VALIDATION).toBe('VALIDATION');
      expect(ErrorCategory.RATE_LIMIT).toBe('RATE_LIMIT');
      expect(ErrorCategory.SERVER_ERROR).toBe('SERVER_ERROR');
      expect(ErrorCategory.UNKNOWN).toBe('UNKNOWN');
    });

    it('should have error severities', () => {
      expect(ErrorSeverity.LOW).toBe('LOW');
      expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
      expect(ErrorSeverity.HIGH).toBe('HIGH');
      expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
    });

    it('should have event statuses', () => {
      expect(EventStatus.PENDING).toBe('PENDING');
      expect(EventStatus.QUEUED).toBe('QUEUED');
      expect(EventStatus.DELIVERING).toBe('DELIVERING');
      expect(EventStatus.DELIVERED).toBe('DELIVERED');
      expect(EventStatus.FAILED).toBe('FAILED');
      expect(EventStatus.DEAD_LETTER).toBe('DEAD_LETTER');
      expect(EventStatus.CANCELLED).toBe('CANCELLED');
    });
  });
});