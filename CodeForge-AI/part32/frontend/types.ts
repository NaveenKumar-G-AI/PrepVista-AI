// Mirrors src/domain/types.ts on the backend. Kept as a plain, dependency-free
// copy here so this component set can be dropped into a frontend repo that
// doesn't share a package with the backend. If your monorepo can share
// types directly, delete this file and import from the backend package
// instead - just don't let the two definitions drift silently.

export type GapStatus =
  | "NO_GAP"
  | "BELOW_TARGET"
  | "PARTIAL"
  | "UNASSESSED"
  | "INSUFFICIENT_EVIDENCE"
  | "INCONSISTENT"
  | "DEPENDENCY_BLOCKED";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RoleSkillImportance = "CORE" | "IMPORTANT" | "SUPPORTING" | "OPTIONAL";
export type GapTrend = "IMPROVING" | "STABLE" | "WORSENING" | "VOLATILE" | "UNKNOWN";
export type ClosureState = "OPEN" | "IN_PROGRESS" | "NEARLY_CLOSED" | "CLOSED" | "REOPENED" | "UNASSESSED";

export interface SkillGapResult {
  skillId: string;
  skillName: string;
  importance: RoleSkillImportance;
  currentState: { masteryLevel: number | null; label: string };
  targetState: { masteryLevel: number; label: string };
  gapStatus: GapStatus;
  gapMagnitude: number;
  severity: Severity;
  priorityScore: number;
  priorityRank: number | null;
  confidence: number;
  trend: GapTrend;
  closureState: ClosureState;
  closureReason: string;
  evidenceSummary: {
    totalCount: number;
    latestAt: string | null;
    diversity: number;
  };
  dependency: {
    isRootGap: boolean;
    blockedBy: string[];
    blocks: string[];
  };
  explanation: {
    summarySentence: string;
    roleRequirement: string;
    demonstratedCapability: string;
    evidenceNote: string;
    trendNote?: string;
  };
  aiExplanation: string | null;
}

export interface RoleGapProfile {
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  skills: SkillGapResult[];
  criticalGaps: SkillGapResult[];
  priorityGaps: SkillGapResult[];
  unassessedSkills: SkillGapResult[];
  rootGaps: SkillGapResult[];
  coreSkillCoverage: { total: number; meetingTarget: number };
  calculatedAt: string;
}

export const MASTERY_SCALE_MAX = 4; // EMERGING..STRONG - keep in sync with backend MasteryLevel
