import type { MasteryLevel, ReadinessState } from '../domain/enums';

/**
 * These interfaces describe the boundary between Feature 36 and the
 * rest of CodeForge. Per the spec (sections 9, 15, 20, 24, 54):
 *   "Use existing systems. Do not duplicate their calculations."
 * Feature 36 never recomputes mastery, readiness, or growth itself —
 * it only aggregates what these systems already produced.
 *
 * Swap MockXAdapter (src/integrations/mockAdapters.ts) for a real
 * implementation once the actual services are available: implement
 * the interface, then construct it in src/integrations/index.ts
 * instead of the mock, and set USE_MOCK_INTEGRATIONS=false.
 */

export interface StudentSkillSignal {
  studentId: string;
  skillId: string;
  skillName: string;
  level: MasteryLevel;
  hasEvidence: boolean;
  lastAssessedAt: Date | null;
  sourceVersion: string;
}

/** Wraps the existing Skill Signal Engine / Technical Skill Snapshot. */
export interface SkillSignalPort {
  listKnownSkills(organizationId: string): Promise<Array<{ skillId: string; skillName: string }>>;
  getSkillSignalsForStudents(
    organizationId: string,
    studentIds: string[],
    skillId?: string
  ): Promise<StudentSkillSignal[]>;
}

export interface RequiredSkillGapSignal {
  skillId: string;
  skillName: string;
  deficient: boolean;
}

export interface StudentRoleReadiness {
  studentId: string;
  roleId: string;
  roleName: string;
  state: ReadinessState;
  hasEvidence: boolean;
  requiredSkillGaps: RequiredSkillGapSignal[];
  sourceVersion: string;
}

/** Wraps the existing Role Readiness Engine. */
export interface RoleReadinessPort {
  listSupportedRoles(organizationId: string): Promise<Array<{ roleId: string; roleName: string }>>;
  getRoleReadinessForStudents(
    organizationId: string,
    studentIds: string[],
    roleId?: string
  ): Promise<StudentRoleReadiness[]>;
}

export interface StudentGrowthSample {
  studentId: string;
  skillId: string;
  periodLabel: string;
  proficientOrAbove: boolean;
  hasEvidence: boolean;
}

/** Wraps the existing Technical Growth Tracking system. */
export interface GrowthTrackingPort {
  getGrowthSamples(
    organizationId: string,
    studentIds: string[],
    skillId: string,
    periodLabels: string[]
  ): Promise<StudentGrowthSample[]>;
}

export interface RecommendedAction {
  skillId?: string;
  roleId?: string;
  trainingImpactPotential: number; // 0-1
  reason: string;
}

/** Wraps the existing Next Best Action Engine (section 20). */
export interface NextBestActionPort {
  getRecommendedFocusAreas(organizationId: string, studentIds: string[]): Promise<RecommendedAction[]>;
}

export interface IntegrationPorts {
  skillSignals: SkillSignalPort;
  roleReadiness: RoleReadinessPort;
  growthTracking: GrowthTrackingPort;
  nextBestAction: NextBestActionPort;
}
