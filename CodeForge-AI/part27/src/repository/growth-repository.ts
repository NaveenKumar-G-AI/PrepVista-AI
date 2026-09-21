import type { SkillEvidence } from '../types/evidence.js';
import type { SkillState, GrowthSnapshot } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import type { GrowthMilestone } from '../types/milestone.js';
import type { GrowthInsight } from '../types/insight.js';

/**
 * The one interface every persistence concern in this module goes through.
 * Two implementations exist: InMemoryGrowthRepository (used by tests and
 * the demo fixture — no external dependency) and SupabaseGrowthRepository
 * (real Postgres, matches db/migrations/*.sql). Nothing in src/analysis,
 * src/trajectory, src/milestones, src/events, or src/orchestration ever
 * imports Supabase directly — they only ever see this interface, so the
 * whole engine is testable without a database and portable to whatever
 * CodeForge's actual persistence layer turns out to be.
 *
 * Every write here is an append. There is deliberately no updateSkillState
 * or deleteEvidence method — historical immutability (section 51) is
 * enforced by the shape of this interface, not by a policy someone has to
 * remember to follow.
 */
export interface GrowthRepository {
  // Evidence — append-only, idempotent on (source, sourceRecordId, skillId).
  appendEvidence(evidence: SkillEvidence): Promise<{ inserted: boolean; existing: SkillEvidence | null }>;
  getEvidenceForSkill(studentId: string, skillId: string): Promise<SkillEvidence[]>;
  getEvidenceForStudent(studentId: string): Promise<SkillEvidence[]>;

  // Skill state — append-only snapshots. "Current" state = latest snapshot.
  appendSkillStateSnapshot(state: SkillState): Promise<void>;
  getLatestSkillState(studentId: string, skillId: string): Promise<SkillState | null>;
  getAllLatestSkillStates(studentId: string): Promise<SkillState[]>;
  getSkillStateHistory(studentId: string, skillId: string): Promise<SkillState[]>;

  // Growth events — append-only.
  appendGrowthEvent(event: GrowthEvent): Promise<void>;
  getGrowthEvents(studentId: string, options?: { skillId?: string; since?: string }): Promise<GrowthEvent[]>;

  // Milestones — append-only, idempotent per (definitionId, skillId).
  appendMilestone(milestone: GrowthMilestone): Promise<void>;
  getMilestones(studentId: string): Promise<GrowthMilestone[]>;
  getAwardedMilestoneKeys(studentId: string): Promise<Set<string>>;

  // Point-in-time full-profile exports (section 14) — append-only.
  appendGrowthSnapshot(snapshot: GrowthSnapshot): Promise<void>;
  getLatestGrowthSnapshot(studentId: string): Promise<GrowthSnapshot | null>;

  // Cached AI-narrated insights — append-only, purely a display cache; the
  // authoritative facts they narrate always live in the tables above.
  appendInsight(studentId: string, insight: GrowthInsight): Promise<void>;
  getRecentInsights(studentId: string, limit?: number): Promise<GrowthInsight[]>;
}
