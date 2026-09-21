import { z } from "zod";
import {
  EvidenceState,
  EvidenceStrength,
  GapStatus,
  MasteryLevel,
  ReportFreshnessStatus,
  ReportLifecycleStatus,
  ReportType,
  RoleReadinessLevel,
  SkillTrend,
} from "./enums";

/**
 * This file is the "Validated Report DTO" from brief §8/§15. The renderer
 * (HTTP responses, PDF export, frontend) NEVER touches raw fixture/service
 * data directly — it only ever sees objects that satisfy
 * TechnicalMasteryReportDtoSchema, produced by the assembler and checked by
 * the validator. That boundary is what makes "never fabricate missing
 * information" (§16) and "AI cannot override structured truth" (§37)
 * enforceable rather than aspirational.
 */

export const SkillMasteryEntrySchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  masteryLevel: z.nativeEnum(MasteryLevel),
  trend: z.nativeEnum(SkillTrend),
  evidenceStrength: z.nativeEnum(EvidenceStrength),
  evidenceCount: z.number().int().nonnegative(),
  lastEvaluatedAt: z.string(),
  roleRelevance: z.array(z.string()),
  gapStatus: z.nativeEnum(GapStatus),
});
export type SkillMasteryEntry = z.infer<typeof SkillMasteryEntrySchema>;

export const RoleReadinessEntrySchema = z.object({
  roleId: z.string(),
  roleName: z.string(),
  readiness: z.nativeEnum(RoleReadinessLevel),
  readyAreas: z.array(z.string()),
  developingAreas: z.array(z.string()),
  blockingGaps: z.array(z.string()),
});
export type RoleReadinessEntry = z.infer<typeof RoleReadinessEntrySchema>;

export const SkillGapEntrySchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  currentState: z.nativeEnum(MasteryLevel),
  expectedState: z.nativeEnum(MasteryLevel),
  gap: z.string(),
  evidenceRefs: z.array(z.string()),
  roleImpact: z.string(),
  recommendedAction: z.string(),
});
export type SkillGapEntry = z.infer<typeof SkillGapEntrySchema>;

export const NextBestActionEntrySchema = z.object({
  action: z.string(),
  why: z.string(),
  relatedSkill: z.string().nullable(),
  roleImpact: z.string().nullable(),
  priority: z.number().int(),
});
export type NextBestActionEntry = z.infer<typeof NextBestActionEntrySchema>;

export const CodingPerformanceSchema = z.object({
  correctness: z.string().nullable(),
  efficiency: z.string().nullable(),
  complexity: z.string().nullable(),
  codeQuality: z.string().nullable(),
  problemSolving: z.string().nullable(),
  evidenceState: z.nativeEnum(EvidenceState),
  sampleCount: z.number().int(),
  lastEvaluatedAt: z.string().nullable(),
});
export type CodingPerformance = z.infer<typeof CodingPerformanceSchema>;

export const DebuggingEvidenceSchema = z.object({
  capability: z.string().nullable(),
  commonWeakness: z.string().nullable(),
  trend: z.nativeEnum(SkillTrend).nullable(),
  evidenceState: z.nativeEnum(EvidenceState),
});
export type DebuggingEvidence = z.infer<typeof DebuggingEvidenceSchema>;

export const ReasoningEvidenceSchema = z.object({
  reasoningNote: z.string().nullable(),
  understandingNote: z.string().nullable(),
  evidenceState: z.nativeEnum(EvidenceState),
});
export type ReasoningEvidence = z.infer<typeof ReasoningEvidenceSchema>;

export const ProjectEvidenceEntrySchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  skillsDemonstrated: z.array(z.string()),
  technicalDepth: z.string(),
  relevantRole: z.string().nullable(),
  evidenceState: z.nativeEnum(EvidenceState),
});
export type ProjectEvidenceEntry = z.infer<typeof ProjectEvidenceEntrySchema>;

export const InterviewEvidenceEntrySchema = z.object({
  interviewId: z.string(),
  interviewName: z.string(),
  outcome: z.string(),
  evaluatedSkills: z.array(z.string()),
  evidenceState: z.nativeEnum(EvidenceState),
  occurredAt: z.string(),
});
export type InterviewEvidenceEntry = z.infer<typeof InterviewEvidenceEntrySchema>;

export const GrowthEventSchema = z.object({
  skillName: z.string(),
  occurredAt: z.string(),
  fromLevel: z.nativeEnum(MasteryLevel),
  toLevel: z.nativeEnum(MasteryLevel),
  note: z.string().nullable(),
});
export type GrowthEvent = z.infer<typeof GrowthEventSchema>;

export const GrowthSchema = z.object({
  timeline: z.array(GrowthEventSchema),
  fastestImproving: z.array(z.string()),
  stable: z.array(z.string()),
  persistentGaps: z.array(z.string()),
  recentlyImproved: z.array(z.string()),
  insufficientData: z.boolean(),
});
export type Growth = z.infer<typeof GrowthSchema>;

export const StrengthSchema = z.object({
  title: z.string(),
  evidenceRefs: z.array(z.string()),
  skill: z.string(),
  roleRelevance: z.array(z.string()),
});
export type Strength = z.infer<typeof StrengthSchema>;

export const WeaknessSchema = z.object({
  title: z.string(),
  evidenceRefs: z.array(z.string()),
  impact: z.string(),
  recommendedAction: z.string(),
});
export type Weakness = z.infer<typeof WeaknessSchema>;

export const NarrativeSchema = z.object({
  executiveSummary: z.string(),
  strengthsNarrative: z.string(),
  weaknessesNarrative: z.string(),
  growthNarrative: z.string(),
  source: z.enum(["ai", "fallback"]),
  validated: z.boolean(),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const TechnicalMasteryReportDtoSchema = z.object({
  metadata: z.object({
    reportId: z.string(),
    reportType: z.nativeEnum(ReportType),
    schemaVersion: z.string(),
    sourceDataVersion: z.number().int(),
    generatedAt: z.string(),
    generatedById: z.string(),
    status: z.nativeEnum(ReportLifecycleStatus),
  }),
  identity: z.object({
    studentId: z.string(),
    studentName: z.string(),
  }),
  organization: z.object({
    orgId: z.string(),
    orgName: z.string(),
  }),
  summary: z.object({
    overallMastery: z.nativeEnum(MasteryLevel).nullable(),
    targetRole: z.string().nullable(),
    roleReadiness: z.nativeEnum(RoleReadinessLevel).nullable(),
    strongestAreas: z.array(z.string()),
    criticalGaps: z.array(z.string()),
    recentGrowthHighlight: z.string().nullable(),
    nextBestAction: z.string().nullable(),
  }),
  mastery: z.object({
    overallLevel: z.nativeEnum(MasteryLevel).nullable(),
  }),
  skills: z.array(SkillMasteryEntrySchema),
  roles: z.array(RoleReadinessEntrySchema),
  gaps: z.array(SkillGapEntrySchema),
  evidence: z.object({
    coding: CodingPerformanceSchema.nullable(),
    debugging: DebuggingEvidenceSchema.nullable(),
    reasoning: ReasoningEvidenceSchema.nullable(),
    projects: z.array(ProjectEvidenceEntrySchema),
    interviews: z.array(InterviewEvidenceEntrySchema),
  }),
  growth: GrowthSchema,
  strengths: z.array(StrengthSchema),
  weaknesses: z.array(WeaknessSchema),
  recommendations: z.array(NextBestActionEntrySchema),
  narrative: NarrativeSchema,
  freshness: z.nativeEnum(ReportFreshnessStatus),
});

export type TechnicalMasteryReportDto = z.infer<typeof TechnicalMasteryReportDtoSchema>;
