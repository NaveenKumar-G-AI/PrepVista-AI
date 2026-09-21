/**
 * Domain types for the Role Readiness Engine.
 *
 * These types are the contract between this engine and the rest of
 * CodeForge AI. They intentionally do not import anything from `ports/`,
 * `api/`, or `ai/` — the domain layer knows nothing about HTTP, auth,
 * databases, or LLMs.
 */

export type MasteryLevel =
  | 'unassessed'
  | 'emerging'
  | 'developing'
  | 'competent'
  | 'strong'
  | 'advanced';

export type DefiniteMasteryLevel = Exclude<MasteryLevel, 'unassessed'>;

export type SkillImportance = 'core' | 'important' | 'supporting' | 'optional';

/**
 * Evidence hierarchy (Phase 6). "repeated_verified_performance" is treated as
 * tier-equal to "verified_direct_performance" in EVIDENCE_TIER_WEIGHT (see
 * config.ts) — repetition's extra trust shows up through the evidence
 * *quantity* factor in confidence.ts, not through a separate higher tier
 * weight. That avoids double-counting the same signal twice.
 */
export type EvidenceStrengthTier =
  | 'verified_direct_performance'
  | 'repeated_verified_performance'
  | 'verified_understanding'
  | 'reasoning_consistency'
  | 'historical_performance'
  | 'weak_indirect';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * A single piece of evidence, already produced by an upstream authoritative
 * system (Skill Signal Engine, debugging engine, reasoning verifier, etc).
 * This engine never fabricates or re-derives evidence — it only aggregates
 * evidence it is handed (Phase 5, Phase 68).
 */
export interface EvidenceRecord {
  id: string;
  skillId: string;
  tier: EvidenceStrengthTier;
  /** 0-100, as produced by the owning upstream system. */
  rawScore: number;
  difficulty: Difficulty;
  /** e.g. 'challenge', 'debugging_task', 'reasoning_check', 'code_review' */
  taskType: string;
  challengeId?: string;
  /** ISO-8601 timestamp of when the evidence was produced. */
  timestamp: string;
  /** Only verified: true evidence is ever aggregated (see evidenceAggregation.ts). */
  verified: boolean;
  /** Traceability (Phase 22, 53) — which upstream system produced this. */
  sourceSystem: string;
}

export interface SkillRequirement {
  skillId: string;
  skillName: string;
  importance: SkillImportance;
  minimumMastery: DefiniteMasteryLevel;
  /** Overrides the default IMPORTANCE_WEIGHT when the real role model defines its own (Phase 13). */
  weight?: number;
  evidenceRequirement: {
    minEvidenceCount: number;
    minTier: EvidenceStrengthTier;
  };
}

export interface RoleModel {
  roleId: string;
  roleName: string;
  /** Role model version (Phase 26) — stamped onto every result for traceability. */
  version: string;
  skills: SkillRequirement[];
}

/**
 * Three states, not two — this is the mechanism behind Phase 7. "unassessed"
 * (zero evidence) and "insufficient_evidence" (some evidence, not enough to
 * trust) are both distinct from "assessed", and neither is ever silently
 * collapsed into a numeric zero.
 */
export type SkillEvidenceStatus = 'unassessed' | 'insufficient_evidence' | 'assessed';

export type ConsistencyState = 'insufficient_sample' | 'stable' | 'unstable';
export type TrendState = 'improving' | 'stable' | 'declining' | 'insufficient_data';

/** Per-skill aggregate produced by evidenceAggregation.ts. Internal — not sent to students as-is. */
export interface SkillSignal {
  skillId: string;
  status: SkillEvidenceStatus;
  mastery: MasteryLevel;
  /** Internal continuous 0-100 estimate used for ranking/scoring only — never shown to a student as fake precision (Phase 16). Null when unassessed. */
  masteryScoreEstimate: number | null;
  evidenceCount: number;
  qualifyingEvidenceCount: number;
  distinctTaskTypes: number;
  distinctDifficulties: number;
  /** 0-1 average recency weight across evidence for this skill. */
  recencyScore: number;
  consistency: ConsistencyState;
  consistencyDetail?: { stddev: number; sampleSize: number };
  trend: TrendState;
  mostRecentEvidenceAt: string | null;
  highestDifficultyPassed: Difficulty | null;
  /** Phase 49 — distinguishes "genuinely never attempted" from "upstream source was unavailable this run". */
  dataAvailability: 'ok' | 'source_unavailable';
  /** Phase 22/53 — evidence ids that fed this signal, for audit trails. Internal only. */
  contributingEvidenceIds: string[];
}

export type BlockerType = 'below_threshold' | 'insufficient_evidence' | 'inconsistent_performance';
export type BlockerSeverity = 'critical' | 'moderate';

export interface ReadinessBlocker {
  skillId: string;
  skillName: string;
  type: BlockerType;
  severity: BlockerSeverity;
  /** Always names the specific skill and reason — never a generic "improve your skills" (Phase 19). */
  message: string;
}

export interface ReadinessStrength {
  skillId: string;
  skillName: string;
  mastery: MasteryLevel;
  message: string;
}

export type ReadinessState =
  | 'NOT_ASSESSED'
  | 'EARLY_STAGE'
  | 'DEVELOPING'
  | 'APPROACHING_READY'
  | 'READY'
  | 'STRONGLY_READY';

export type ConfidenceBucket = 'low' | 'medium' | 'high';

/** Student-visible-shaped skill row (Phase 21). */
export interface SkillReadinessResult {
  skillId: string;
  skillName: string;
  importance: SkillImportance;
  required: DefiniteMasteryLevel;
  currentMastery: MasteryLevel;
  status: SkillEvidenceStatus;
  confidence: ConfidenceBucket;
  confidenceScore: number;
  evidenceCount: number;
  recentTrend: TrendState;
  meetsThreshold: boolean;
  blocker: BlockerType | null;
}

export interface ReadinessResult {
  studentId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  algorithmVersion: string;

  readinessState: ReadinessState;
  /** 0-100 integer. Deliberately rounded — no fake decimal precision (Phase 16). */
  readinessScore: number;

  confidence: ConfidenceBucket;
  confidenceScore: number;
  /** 0-1, importance-weighted fraction of role skills with status 'assessed'. */
  coverage: number;

  coreGatePassed: boolean;

  strengths: ReadinessStrength[];
  blockers: ReadinessBlocker[];
  skillBreakdown: SkillReadinessResult[];

  /** Phase 49 — e.g. partial upstream failures. Empty array in the normal case. */
  warnings: string[];

  /** Phase 22/53 — which evidence ids contributed to which skill. Internal only, not student-facing. */
  evidenceTrace: { skillId: string; evidenceIds: string[] }[];

  calculatedAt: string;
}

export interface CohortReadinessSummary {
  roleId: string;
  totalStudents: number;
  byState: Record<ReadinessState, number>;
  mostCommonBlockers: { skillId: string; skillName: string; count: number }[];
}
