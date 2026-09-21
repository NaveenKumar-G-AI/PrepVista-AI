/**
 * Domain types for ACEAPT Feature 32 — "Readiness Radar".
 *
 * These are intentionally plain data shapes (no ORM decorators, no
 * framework coupling) so they can be lifted into ACEAPT's real codebase
 * and mapped onto whatever entities already exist there (see
 * docs in README.md, section "Integrating into a real ACEAPT repo").
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";

export type Trend = "IMPROVING" | "DECLINING" | "STABLE" | "INSUFFICIENT_DATA";

export type ActionPriority = "DO_FIRST" | "DO_NEXT" | "OPTIONAL";

export type ActionType =
  | "TAKE_ASSESSMENT"
  | "TARGETED_PRACTICE"
  | "TIMED_DRILL"
  | "MOCK_SIMULATION";

export type CapabilityCategory = "technical" | "aptitude" | "soft_skill";

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: CapabilityCategory;
}

export interface RoleRubricEntry {
  capabilityId: string;
  /** 0..1, entries for a role should sum to ~1 */
  weight: number;
  /** 0..100 minimum score ACEAPT expects for this role */
  targetBar: number;
}

export interface RoleRubric {
  roleId: string;
  roleName: string;
  entries: RoleRubricEntry[];
}

export interface StudentProfile {
  studentId: string;
  displayName: string;
  targetRoleId: string | null;
  updatedAt: string;
}

export interface AssessmentAttempt {
  id: string;
  studentId: string;
  capabilityId: string;
  score: number; // 0..100
  takenAt: string; // ISO timestamp
  source: string; // e.g. "practice_set" | "mock_test" | "post_action_practice"
}

export interface ReadinessEvent {
  id: string;
  studentId: string;
  type:
    | "FEATURE_OPENED"
    | "ANALYSIS_COMPLETED"
    | "TARGET_ROLE_SET"
    | "ASSESSMENT_COMPLETED"
    | "RECOMMENDATION_ACCEPTED"
    | "ACTION_COMPLETED"
    | "ACTION_SKIPPED"
    | "STATE_UPDATED";
  payload: Record<string, unknown>;
  createdAt: string;
}

/** A single piece of raw evidence backing a gap or recommendation. */
export interface EvidenceItem {
  attemptId: string;
  score: number;
  takenAt: string;
  source: string;
}

/**
 * KNOWN + INFERENCE for one capability: what we actually measured, and
 * what we infer from it. Never a bare number without evidence/confidence.
 */
export interface CapabilityGap {
  capabilityId: string;
  capabilityName: string;
  category: CapabilityCategory;
  weight: number;
  targetBar: number;
  currentScore: number | null; // KNOWN (null = no evidence yet)
  gap: number | null; // INFERENCE derived from currentScore vs targetBar
  trend: Trend; // INFERENCE
  confidence: Confidence; // UNCERTAINTY
  evidenceCount: number;
  lastAssessedAt: string | null;
  evidence: EvidenceItem[];
  onTrack: boolean; // true once currentScore >= targetBar with evidence
}

export interface RecommendationActionEvent {
  type: "ACTION_COMPLETED" | "ACTION_SKIPPED";
  at: string;
}

/** RECOMMENDATION, always traceable back to REASON -> SIGNALS -> EVIDENCE. */
export interface Recommendation {
  id: string; // deterministic: `${capabilityId}__${actionType}`
  capabilityId: string;
  capabilityName: string;
  actionType: ActionType;
  actionLabel: string;
  priority: ActionPriority;
  confidence: Confidence;
  explanation: string; // human-readable REASON, built from real evidence
  evidence: EvidenceItem[]; // SIGNALS/EVIDENCE backing the reason
  lastActionEvent: RecommendationActionEvent | null;
}

export type ReadinessStatus = "NO_TARGET_ROLE" | "INSUFFICIENT_DATA" | "READY";

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
