import type { GrowthRepository } from '../repository/growth-repository.js';
import type { SkillState, SkillStateLabel, TrajectoryLabel, ConfidenceLevel } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import type { GrowthMilestone } from '../types/milestone.js';
import type { GrowthSnapshot } from '../types/skill-state.js';
import type { GrowthInsight, TimeWindow } from '../types/insight.js';
import type { EvidenceSource, EvidenceOutcome, EvidenceQuality } from '../types/evidence.js';
import type { AIProvider } from '../insights/ai-provider.js';
import type { GrowthCategory } from '../config/roles.js';
import { detectStrengths, detectWeaknesses, detectBottleneck, type BottleneckResult } from '../analysis/index.js';
import { generateGrowthInsight } from '../insights/insight-engine.js';
import { getRoleGrowthProfile, type RoleGrowthProfile } from '../config/roles.js';
import { assertAuthorized, type AuthorizationProvider } from './authorization.js';

/**
 * Framework-agnostic operations matching section 55's API list exactly.
 * Every function starts with assertAuthorized — none of them trust
 * student_id/skill_id/event_id/snapshot_id from the caller without a
 * server-side ownership check (section 97). The Next.js route handlers in
 * next-routes.example.ts are thin wrappers around these; the real work,
 * and the real tests, live here.
 */

export interface GrowthProfile {
  studentId: string;
  strengths: SkillState[];
  weaknesses: SkillState[];
  bottleneck: BottleneckResult | null;
  improvingSkills: SkillState[];
  stableSkills: SkillState[];
  atRiskSkills: SkillState[];
  recoveredSkillIds: string[];
  transferStrongSkillIds: string[];
  retentionStableSkillIds: string[];
  recentMilestones: GrowthMilestone[];
}

export async function getGrowthProfile(studentId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<GrowthProfile> {
  await assertAuthorized(requestingUserId, studentId, authz);
  const skillStates = await repo.getAllLatestSkillStates(studentId);
  const events = await repo.getGrowthEvents(studentId);
  const milestones = await repo.getMilestones(studentId);

  const recoveredSkillIds = Array.from(new Set(events.filter((e) => e.eventType === 'SKILL_RECOVERED' && e.skillId).map((e) => e.skillId as string)));

  return {
    studentId,
    strengths: detectStrengths(skillStates),
    weaknesses: detectWeaknesses(skillStates),
    bottleneck: detectBottleneck(skillStates),
    improvingSkills: skillStates.filter((s) => s.trajectory === 'IMPROVING' || s.trajectory === 'RAPIDLY_IMPROVING'),
    stableSkills: skillStates.filter((s) => s.trajectory === 'STABLE'),
    atRiskSkills: skillStates.filter((s) => s.state === 'AT_RISK' || s.retention === 'AT_RISK'),
    recoveredSkillIds,
    transferStrongSkillIds: skillStates.filter((s) => s.transfer === 'STRONG').map((s) => s.skillId),
    retentionStableSkillIds: skillStates.filter((s) => s.retention === 'RETAINED').map((s) => s.skillId),
    recentMilestones: [...milestones].slice(-5).reverse(),
  };
}

export interface SkillProgressionPoint {
  computedAt: string;
  state: SkillStateLabel;
  trajectory: TrajectoryLabel;
  confidenceLevel: ConfidenceLevel;
}

/** Condensed progression — powers a sparkline/timeline view without shipping full snapshot payloads. */
export async function getSkillProgression(studentId: string, skillId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<SkillProgressionPoint[]> {
  await assertAuthorized(requestingUserId, studentId, authz);
  const history = await repo.getSkillStateHistory(studentId, skillId);
  return history.map((s) => ({ computedAt: s.computedAt, state: s.state, trajectory: s.trajectory, confidenceLevel: s.confidence.level }));
}

/** Full snapshot history for one skill — powers the Skill Evolution View (section 39). */
export async function getSkillHistory(studentId: string, skillId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<SkillState[]> {
  await assertAuthorized(requestingUserId, studentId, authz);
  return repo.getSkillStateHistory(studentId, skillId);
}

export async function getGrowthTimeline(studentId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider, options?: { since?: string; skillId?: string }): Promise<GrowthEvent[]> {
  await assertAuthorized(requestingUserId, studentId, authz);
  return repo.getGrowthEvents(studentId, options);
}

export async function getMilestones(studentId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<GrowthMilestone[]> {
  await assertAuthorized(requestingUserId, studentId, authz);
  return repo.getMilestones(studentId);
}

export async function getGrowthSnapshot(studentId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<GrowthSnapshot | null> {
  await assertAuthorized(requestingUserId, studentId, authz);
  return repo.getLatestGrowthSnapshot(studentId);
}

export interface RoleGrowthView {
  role: RoleGrowthProfile | null;
  emphasizedSkills: SkillState[];
  allSkills: SkillState[];
}

export async function getRoleGrowth(
  studentId: string,
  roleId: string,
  requestingUserId: string,
  repo: GrowthRepository,
  authz: AuthorizationProvider,
  categorize?: (skillId: string) => GrowthCategory | null,
): Promise<RoleGrowthView> {
  await assertAuthorized(requestingUserId, studentId, authz);
  const role = getRoleGrowthProfile(roleId);
  const allSkills = await repo.getAllLatestSkillStates(studentId);
  const emphasizedSkills =
    role && categorize
      ? allSkills.filter((s) => {
          const category = categorize(s.skillId);
          return category !== null && role.emphasize.includes(category);
        })
      : [];
  return { role, emphasizedSkills, allSkills };
}

export interface EvidenceSummary {
  evidenceId: string;
  source: EvidenceSource;
  outcome: EvidenceOutcome;
  evidenceType: EvidenceQuality;
  timestamp: string;
}

/** Deliberately omits internal weighting/metadata — section 67: don't expose hidden scoring internals to students or unauthorized instructors. */
export async function getGrowthEvidence(studentId: string, skillId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider): Promise<EvidenceSummary[]> {
  await assertAuthorized(requestingUserId, studentId, authz);
  const evidence = await repo.getEvidenceForSkill(studentId, skillId);
  return evidence.map((e) => ({ evidenceId: e.evidenceId, source: e.source, outcome: e.outcome, evidenceType: e.evidenceType, timestamp: e.timestamp }));
}

export interface GrowthInsightsOptions {
  window: TimeWindow;
  aiProvider?: AIProvider;
  studentAuthoredNotes?: string;
}

export async function getGrowthInsights(studentId: string, requestingUserId: string, repo: GrowthRepository, authz: AuthorizationProvider, options: GrowthInsightsOptions): Promise<GrowthInsight> {
  await assertAuthorized(requestingUserId, studentId, authz);
  const skillStates = await repo.getAllLatestSkillStates(studentId);
  const events = await repo.getGrowthEvents(studentId, { since: options.window.startTimestamp });
  const evidenceIds = Array.from(new Set(skillStates.flatMap((s) => s.evidenceRefs)));
  return generateGrowthInsight({
    studentId,
    skillStates,
    events,
    evidenceIds,
    timeWindow: options.window,
    studentAuthoredNotes: options.studentAuthoredNotes,
    provider: options.aiProvider,
  });
}
