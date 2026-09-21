import {
  EvidenceState,
  EvidenceStrength,
  MasteryLevel,
  RoleReadinessLevel,
  SkillTrend,
  UserRole,
} from "../domain/enums";

/**
 * PORTS = THE ABSOLUTE RULE, TYPED.
 *
 * Brief §2: "Feature 38 is a reporting and intelligence-presentation layer
 * ... It MUST consume the authoritative outputs already produced by
 * CodeForge ... Do NOT independently recalculate: mastery, skill scores,
 * role readiness, role gaps, technical performance, growth, recommendations."
 *
 * Every one of those calculations is behind an interface below, never a
 * concrete implementation. src/adapters/fixture-adapters.ts is the ONLY
 * file that implements them, and it does so by reading fixture_* tables
 * that simulate pre-existing services — it is explicitly not allowed to
 * derive a mastery level, readiness value, or gap from anything else; it
 * only returns what's already stored. Swapping to the real CodeForge
 * services in production means writing one new adapters file that
 * implements these same interfaces by calling the real services/APIs —
 * no service, route, or test in this codebase should need to change.
 */

export interface AuthenticatedUser {
  id: string;
  orgId: string;
  role: UserRole;
  /** Set when role === STUDENT; identifies which student record this user is. */
  studentId?: string;
}

export interface StudentRecord {
  id: string;
  orgId: string;
  name: string;
  targetRoleIds: string[];
}

export interface OrganizationRecord {
  id: string;
  name: string;
}

export interface IdentityPort {
  getStudent(studentId: string): Promise<StudentRecord | null>;
  getOrganization(orgId: string): Promise<OrganizationRecord | null>;
  /** Tenant + relationship authorization — brief §46-50. */
  canUserAccessStudent(user: AuthenticatedUser, studentId: string): Promise<boolean>;
}

export interface DataVersionPort {
  /** Monotonically increasing per student; bumped whenever underlying intelligence changes. */
  getCurrentSourceDataVersion(studentId: string): Promise<number>;
}

export interface SkillMasteryEntryRaw {
  skillId: string;
  skillName: string;
  masteryLevel: MasteryLevel;
  trend: SkillTrend;
  evidenceStrength: EvidenceStrength;
  evidenceCount: number;
  lastEvaluatedAt: string;
  roleRelevance: string[];
}

export interface MasterySystemPort {
  getOverallMastery(studentId: string): Promise<MasteryLevel | null>;
  getSkillMasteryMap(studentId: string): Promise<SkillMasteryEntryRaw[]>;
}

export interface RoleReadinessRaw {
  roleId: string;
  roleName: string;
  readiness: RoleReadinessLevel;
  readyAreas: string[];
  developingAreas: string[];
  blockingGaps: string[];
}

export interface RoleReadinessPort {
  getTargetRoles(studentId: string): Promise<{ id: string; name: string }[]>;
  getRoleReadiness(studentId: string, roleId: string): Promise<RoleReadinessRaw | null>;
}

export interface SkillGapRaw {
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

export interface SkillGapPort {
  getRoleSkillGaps(studentId: string, roleId: string): Promise<SkillGapRaw[]>;
}

export interface GrowthEventRaw {
  skillName: string;
  occurredAt: string;
  fromLevel: MasteryLevel;
  toLevel: MasteryLevel;
  note: string | null;
}

export interface GrowthInsightsRaw {
  fastestImproving: string[];
  stable: string[];
  persistentGaps: string[];
  recentlyImproved: string[];
  insufficientData: boolean;
}

export interface GrowthTrackingPort {
  getGrowthTimeline(studentId: string): Promise<GrowthEventRaw[]>;
  getGrowthInsights(studentId: string): Promise<GrowthInsightsRaw>;
}

export interface NextBestActionRaw {
  action: string;
  why: string;
  relatedSkill: string | null;
  roleImpact: string | null;
  priority: number;
}

export interface NextBestActionPort {
  getNextBestActions(studentId: string): Promise<NextBestActionRaw[]>;
}

export interface CodingPerformanceRaw {
  correctness: string | null;
  efficiency: string | null;
  complexity: string | null;
  codeQuality: string | null;
  problemSolving: string | null;
  evidenceState: EvidenceState;
  sampleCount: number;
  lastEvaluatedAt: string | null;
}

export interface DebuggingEvidenceRaw {
  capability: string | null;
  commonWeakness: string | null;
  trend: SkillTrend | null;
  evidenceState: EvidenceState;
}

export interface ReasoningEvidenceRaw {
  reasoningNote: string | null;
  understandingNote: string | null;
  evidenceState: EvidenceState;
}

export interface CodingEvidencePort {
  getCodingPerformance(studentId: string): Promise<CodingPerformanceRaw | null>;
  getDebuggingEvidence(studentId: string): Promise<DebuggingEvidenceRaw | null>;
  getReasoningEvidence(studentId: string): Promise<ReasoningEvidenceRaw | null>;
}

export interface ProjectEvidenceRaw {
  projectId: string;
  projectName: string;
  skillsDemonstrated: string[];
  technicalDepth: string;
  relevantRole: string | null;
  evidenceState: EvidenceState;
}

export interface ProjectEvidencePort {
  getProjectEvidence(studentId: string): Promise<ProjectEvidenceRaw[]>;
}

export interface InterviewEvidenceRaw {
  interviewId: string;
  interviewName: string;
  outcome: string;
  evaluatedSkills: string[];
  evidenceState: EvidenceState;
  occurredAt: string;
}

export interface InterviewEvidencePort {
  getInterviewEvidence(studentId: string): Promise<InterviewEvidenceRaw[]>;
}

/** Everything the collector needs, bundled for convenient injection. */
export interface CodeForgeIntelligencePorts {
  identity: IdentityPort;
  dataVersion: DataVersionPort;
  mastery: MasterySystemPort;
  roleReadiness: RoleReadinessPort;
  skillGap: SkillGapPort;
  growth: GrowthTrackingPort;
  nextBestAction: NextBestActionPort;
  codingEvidence: CodingEvidencePort;
  projectEvidence: ProjectEvidencePort;
  interviewEvidence: InterviewEvidencePort;
}
