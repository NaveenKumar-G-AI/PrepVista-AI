/**
 * Ports = the boundary between this feature's deterministic core and every
 * CodeForge system it must consume rather than duplicate (Phase 2, 77):
 * the Role model, the Mastery Level System / Skill Signal Engine, the
 * Evidence sources, the AI Gateway, the event bus, the cache, and the
 * downstream engines this feature feeds (Next Best Action, Role Readiness,
 * Technical Mastery Report).
 *
 * Nothing in src/domain or src/application imports a concrete adapter -
 * only these interfaces. Swap `src/adapters/memory.ts` for real adapters
 * backed by your actual services and nothing above this layer changes.
 */

import type {
  ClosureState,
  DependencyEdge,
  DomainEvent,
  EvidenceRecord,
  GapHistoryEntry,
  MasteryLevel,
  RoleGapProfile,
  RoleSkillRequirement,
  SkillGapResult,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Upstream: authoritative sources this feature reads from
// ---------------------------------------------------------------------------

export interface RoleRequirementBundle {
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  requirements: RoleSkillRequirement[];
  dependencyEdges: DependencyEdge[];
}

/** Backed by CodeForge's existing canonical Role-Based Skill Model
 *  (Phase 3). This feature never defines a second role taxonomy. */
export interface RoleModelPort {
  getRoleRequirements(roleId: string, organizationId: string): Promise<RoleRequirementBundle>;
  listAvailableRoles(organizationId: string): Promise<{ roleId: string; roleName: string }[]>;
  /** Used by the recalculation service (Phase 57-58) to know which roles
   *  are affected when a single skill's evidence changes, so recalculation
   *  can stay incremental instead of recomputing everything. */
  findRolesRequiringSkill(skillId: string, organizationId: string): Promise<string[]>;
}

/** Backed by the existing Mastery Level System / Skill Signal Engine
 *  (Phase 5). This is the AUTHORITATIVE current skill state - the gap
 *  engine never derives it itself. */
export interface SkillStatePort {
  getCurrentMastery(
    studentId: string,
    skillIds: string[],
  ): Promise<Map<string, MasteryLevel | null>>;
}

/** Backed by challenge results, hidden tests, debugging performance,
 *  reasoning/understanding checks, etc. (Phase 14). Used only for
 *  confidence/consistency/trend/traceability - never to re-derive mastery. */
export interface EvidencePort {
  getEvidence(studentId: string, skillId: string): Promise<EvidenceRecord[]>;
}

// ---------------------------------------------------------------------------
// AI explanation layer (Phase 33-34) - optional, never authoritative
// ---------------------------------------------------------------------------

export interface AIExplanationContext {
  skillName: string;
  roleName: string;
  structuredExplanation: SkillGapResult["explanation"];
  gapStatus: SkillGapResult["gapStatus"];
  severity: SkillGapResult["severity"];
  trend: SkillGapResult["trend"];
}

/** Backed by CodeForge's existing AI Gateway. Must be safe to omit or fail -
 *  see application/gapAnalysisService.ts, which always has the deterministic
 *  explanation as a fallback (Phase 34, 75). */
export interface AIExplanationPort {
  explain(context: AIExplanationContext): Promise<string>;
}

// ---------------------------------------------------------------------------
// Persistence (Phase 52-54)
// ---------------------------------------------------------------------------

export interface PersistedGapSnapshot extends SkillGapResult {}

export interface GapRepositoryPort {
  getSnapshot(
    organizationId: string,
    studentId: string,
    roleId: string,
    skillId: string,
  ): Promise<PersistedGapSnapshot | null>;
  saveSnapshot(snapshot: PersistedGapSnapshot): Promise<void>;
  recordHistory(entry: GapHistoryEntry): Promise<void>;
  listSnapshotsForRole(
    organizationId: string,
    studentId: string,
    roleId: string,
  ): Promise<PersistedGapSnapshot[]>;
  getHistory(
    organizationId: string,
    studentId: string,
    roleId: string,
    skillId: string,
  ): Promise<GapHistoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Cross-cutting infrastructure (Phase 57-60)
// ---------------------------------------------------------------------------

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}

export interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void;
}

// ---------------------------------------------------------------------------
// Downstream consumers (Phase 43-45) - this feature PUSHES to them; it does
// not try to own readiness, recommendations, or reporting itself.
// ---------------------------------------------------------------------------

export interface NextBestActionGapContext {
  studentId: string;
  organizationId: string;
  roleId: string;
  topPriorityGap: SkillGapResult | null;
}
export interface NextBestActionPort {
  submitGapContext(context: NextBestActionGapContext): Promise<void>;
}

export interface RoleReadinessGapContext {
  studentId: string;
  organizationId: string;
  roleId: string;
  profile: RoleGapProfile;
}
export interface RoleReadinessPort {
  submitGapContext(context: RoleReadinessGapContext): Promise<void>;
}

export interface TechnicalMasteryReportGapContext {
  studentId: string;
  organizationId: string;
  roleId: string;
  profile: RoleGapProfile;
}
export interface TechnicalMasteryReportPort {
  submitGapContext(context: TechnicalMasteryReportGapContext): Promise<void>;
}

export type { ClosureState };
