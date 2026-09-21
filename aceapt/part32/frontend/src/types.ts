/**
 * Mirrors backend/src/types/domain.ts. Kept in sync by hand in this
 * standalone build; in a monorepo this would be a shared package instead.
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
export type Trend = "IMPROVING" | "DECLINING" | "STABLE" | "INSUFFICIENT_DATA";
export type ActionPriority = "DO_FIRST" | "DO_NEXT" | "OPTIONAL";
export type CapabilityCategory = "technical" | "aptitude" | "soft_skill";
export type ReadinessStatus = "NO_TARGET_ROLE" | "INSUFFICIENT_DATA" | "READY";

export interface EvidenceItem {
  attemptId: string;
  score: number;
  takenAt: string;
  source: string;
}

export interface CapabilityGap {
  capabilityId: string;
  capabilityName: string;
  category: CapabilityCategory;
  weight: number;
  targetBar: number;
  currentScore: number | null;
  gap: number | null;
  trend: Trend;
  confidence: Confidence;
  evidenceCount: number;
  lastAssessedAt: string | null;
  evidence: EvidenceItem[];
  onTrack: boolean;
}

export interface Recommendation {
  id: string;
  capabilityId: string;
  capabilityName: string;
  actionType: string;
  actionLabel: string;
  priority: ActionPriority;
  confidence: Confidence;
  explanation: string;
  evidence: EvidenceItem[];
  lastActionEvent: { type: "ACTION_COMPLETED" | "ACTION_SKIPPED"; at: string } | null;
}

export interface ReadinessState {
  studentId: string;
  status: ReadinessStatus;
  targetRoleId: string | null;
  targetRoleName: string | null;
  gaps: CapabilityGap[];
  recommendations: {
    doFirst: Recommendation[];
    doNext: Recommendation[];
    optional: Recommendation[];
  };
  generatedAt: string;
}

export interface RoleOption {
  roleId: string;
  roleName: string;
  capabilities: { capabilityId: string; capabilityName: string; weight: number; targetBar: number }[];
}

export interface ReadinessEvent {
  id: string;
  studentId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
}
