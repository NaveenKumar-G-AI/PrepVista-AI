/**
 * Mirrors server/src/domain/dto.ts. In the real CodeForge monorepo this
 * should be a single shared package imported by both server and web
 * (e.g. @codeforge/report-types) rather than a hand-duplicated copy —
 * duplicated here only because this reference build ships server/ and
 * web/ as independent trees.
 */

export type MasteryLevel = "FOUNDATIONAL" | "DEVELOPING" | "COMPETENT" | "PROFICIENT" | "ADVANCED" | "EXPERT";
export type SkillTrend = "UP" | "STABLE" | "DOWN" | "INSUFFICIENT_DATA";
export type EvidenceStrength = "STRONG" | "MODERATE" | "LIMITED" | "NONE";
export type EvidenceState = "OBSERVED" | "INFERRED" | "ESTIMATED" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
export type GapStatus = "ON_TRACK" | "GAP" | "BLOCKING_GAP" | "NOT_APPLICABLE";
export type RoleReadinessLevel = "READY" | "NEAR_READY" | "DEVELOPING" | "NOT_READY" | "INSUFFICIENT_DATA";
export type ReportFreshnessStatus = "UP_TO_DATE" | "STALE" | "GENERATING" | "FAILED" | "UNAVAILABLE";
export type ReportLifecycleStatus = "REQUESTED" | "QUEUED" | "GENERATING" | "VALIDATING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface SkillMasteryEntry {
  skillId: string;
  skillName: string;
  masteryLevel: MasteryLevel;
  trend: SkillTrend;
  evidenceStrength: EvidenceStrength;
  evidenceCount: number;
  lastEvaluatedAt: string;
  roleRelevance: string[];
  gapStatus: GapStatus;
}

export interface RoleReadinessEntry {
  roleId: string;
  roleName: string;
  readiness: RoleReadinessLevel;
  readyAreas: string[];
  developingAreas: string[];
  blockingGaps: string[];
}

export interface SkillGapEntry {
  skillId: string;
  skillName: string;
  roleId: string;
  roleName: string;
  currentState: MasteryLevel;
  expectedState: MasteryLevel;
  gap: string;
  evidenceRefs: string[];
  roleImpact: string;
  recommendedAction: string;
}

export interface NextBestActionEntry {
  action: string;
  why: string;
  relatedSkill: string | null;
  roleImpact: string | null;
  priority: number;
}

export interface CodingPerformance {
  correctness: string | null;
  efficiency: string | null;
  complexity: string | null;
  codeQuality: string | null;
  problemSolving: string | null;
  evidenceState: EvidenceState;
  sampleCount: number;
  lastEvaluatedAt: string | null;
}

export interface DebuggingEvidence {
  capability: string | null;
  commonWeakness: string | null;
  trend: SkillTrend | null;
  evidenceState: EvidenceState;
}

export interface ReasoningEvidence {
  reasoningNote: string | null;
  understandingNote: string | null;
  evidenceState: EvidenceState;
}

export interface ProjectEvidenceEntry {
  projectId: string;
  projectName: string;
  skillsDemonstrated: string[];
  technicalDepth: string;
  relevantRole: string | null;
  evidenceState: EvidenceState;
}

export interface InterviewEvidenceEntry {
  interviewId: string;
  interviewName: string;
  outcome: string;
  evaluatedSkills: string[];
  evidenceState: EvidenceState;
  occurredAt: string;
}

export interface GrowthEvent {
  skillName: string;
  occurredAt: string;
  fromLevel: MasteryLevel;
  toLevel: MasteryLevel;
  note: string | null;
}

export interface Growth {
  timeline: GrowthEvent[];
  fastestImproving: string[];
  stable: string[];
  persistentGaps: string[];
  recentlyImproved: string[];
  insufficientData: boolean;
}

export interface Strength {
  title: string;
  evidenceRefs: string[];
  skill: string;
  roleRelevance: string[];
}

export interface Weakness {
  title: string;
  evidenceRefs: string[];
  impact: string;
  recommendedAction: string;
}

export interface Narrative {
  executiveSummary: string;
  strengthsNarrative: string;
  weaknessesNarrative: string;
  growthNarrative: string;
  source: "ai" | "fallback";
  validated: boolean;
}

export interface TechnicalMasteryReportDto {
  metadata: {
    reportId: string;
    reportType: "STUDENT_TECHNICAL_MASTERY";
    schemaVersion: string;
    sourceDataVersion: number;
    generatedAt: string;
    generatedById: string;
    status: ReportLifecycleStatus;
  };
  identity: { studentId: string; studentName: string };
  organization: { orgId: string; orgName: string };
  summary: {
    overallMastery: MasteryLevel | null;
    targetRole: string | null;
    roleReadiness: RoleReadinessLevel | null;
    strongestAreas: string[];
    criticalGaps: string[];
    recentGrowthHighlight: string | null;
    nextBestAction: string | null;
  };
  mastery: { overallLevel: MasteryLevel | null };
  skills: SkillMasteryEntry[];
  roles: RoleReadinessEntry[];
  gaps: SkillGapEntry[];
  evidence: {
    coding: CodingPerformance | null;
    debugging: DebuggingEvidence | null;
    reasoning: ReasoningEvidence | null;
    projects: ProjectEvidenceEntry[];
    interviews: InterviewEvidenceEntry[];
  };
  growth: Growth;
  strengths: Strength[];
  weaknesses: Weakness[];
  recommendations: NextBestActionEntry[];
  narrative: Narrative;
  freshness: ReportFreshnessStatus;
}

export interface ViewableReport {
  status: ReportLifecycleStatus;
  freshness: ReportFreshnessStatus;
  dto: TechnicalMasteryReportDto | null;
  failureReason: string | null;
}
