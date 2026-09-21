import { PoolClient } from 'pg';
import { FutureGapCard, LearningPriorityItem, LearningPriorityTier, ProjectRecommendation } from '../types/feature40.types';
import * as feature37 from '../integrations/feature37.adapter';
import { writeOutboxEvent } from '../integrations/outbox';

const FOCUS_MODE_THRESHOLD = 4; // open CRITICAL/HIGH gaps simultaneously

/** Spec ??33 Learning ROI classification -- derived from the gap's own
 * severity/confidence, not a separate hidden score (spec ??109 "no black box
 * scores": the tier must trace back to fields already shown to the user). */
export function classifyLearningTier(gap: FutureGapCard): LearningPriorityTier {
  if (gap.meta.confidence === 'LOW' || gap.meta.confidence === 'UNKNOWN') return 'NOT_A_PRIORITY_RIGHT_NOW';
  if (gap.severity === 'CRITICAL' || gap.severity === 'HIGH') return 'HIGH_VALUE';
  if (gap.severity === 'MODERATE') return 'MEDIUM_VALUE';
  return 'LOW_PRIORITY';
}

function estimateEffort(evidenceExists: boolean, evidenceVerified: boolean): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (evidenceExists && !evidenceVerified) return 'LOW'; // just needs verification, not net-new work
  if (evidenceExists) return 'MEDIUM';
  return 'HIGH';
}

export async function buildLearningPriorities(client: PoolClient, studentId: string, gaps: FutureGapCard[]): Promise<LearningPriorityItem[]> {
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);

  return gaps
    .filter((g) => g.status === 'OPEN' || g.status === 'IN_PROGRESS')
    .map((g) => {
      const evidence = g.skillId ? evidenceMap.get(skillIdToSlugLookup(evidenceMap, g.skillId)) : undefined;
      const effort = estimateEffort(!!evidence, (evidence?.verifiedCount ?? 0) > 0);
      return {
        skillId: g.skillId ?? '', skillName: g.skillName ?? 'this area',
        why: g.explanation, marketSignal: g.marketExpectation, currentEvidence: g.studentEvidence,
        gap: g.severity, effort,
        evidenceOpportunity: `Closing this gap also strengthens your case for ${g.skillName ?? 'this target'} in future applications.`,
        nextAction: g.recommendedAction,
        tier: classifyLearningTier(g),
      };
    })
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

function skillIdToSlugLookup(evidenceMap: Map<string, { skillId: string }>, skillId: string): string {
  for (const [slug, v] of evidenceMap.entries()) if (v.skillId === skillId) return slug;
  return '';
}

function tierRank(t: LearningPriorityTier): number {
  return { HIGH_VALUE: 0, MEDIUM_VALUE: 1, LOW_PRIORITY: 2, NOT_A_PRIORITY_RIGHT_NOW: 3 }[t];
}

const PROJECT_TEMPLATES: Record<string, (skill: string, role: string) => string> = {
  CLOUD: (skill, role) => `Deploy a production-style ${role} service to a real cloud environment, documenting the deployment pipeline as evidence for ${skill}.`,
  TESTING: (skill, role) => `Add a full automated test suite (unit + integration) to an existing ${role}-relevant project, demonstrating ${skill}.`,
  AI: (skill, role) => `Build and document an AI evaluation harness or integration for an existing project, demonstrating ${skill}.`,
  SYSTEM_DESIGN: (skill, role) => `Write and defend a system design document for a ${role}-scale problem, demonstrating ${skill}.`,
  DEFAULT: (skill, role) => `Build a project that specifically exercises ${skill} in a ${role} context, and document the decisions you made.`,
};

/** Spec ??37-38: recommendations must cite the specific gap(s) addressed --
 * never a bare generic template. */
export async function buildProjectRecommendations(
  client: PoolClient,
  roleTitle: string,
  gaps: FutureGapCard[]
): Promise<ProjectRecommendation[]> {
  const topGaps = gaps.filter((g) => g.severity === 'CRITICAL' || g.severity === 'HIGH').slice(0, 3);
  if (topGaps.length === 0) return [];

  const { rows: catRows } = await client.query(`SELECT id, category FROM skills WHERE id = ANY($1)`, [topGaps.map((g) => g.skillId).filter(Boolean)]);
  const categoryBySkillId = new Map<string, string>(catRows.map((r: any) => [r.id, r.category]));

  return topGaps.map((g) => {
    const category = (g.skillId && categoryBySkillId.get(g.skillId)) || 'DEFAULT';
    const template = PROJECT_TEMPLATES[category] ?? PROJECT_TEMPLATES.DEFAULT;
    return {
      title: `${g.skillName ?? 'Target skill'} evidence project`,
      rationale: template(g.skillName ?? 'this skill', roleTitle),
      targetGapIds: [g.id],
      producesEvidenceFor: [g.skillName ?? 'this skill'],
      complexity: g.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      portfolioValue: 'HIGH',
    };
  });
}

/** Spec ??34 Anti-Learning-Hoarding / Focus Mode. */
export function computeFocusMode(gaps: FutureGapCard[]): { active: boolean; message: string | null } {
  const openHighPriority = gaps.filter((g) => (g.severity === 'CRITICAL' || g.severity === 'HIGH') && g.status === 'OPEN');
  if (openHighPriority.length >= FOCUS_MODE_THRESHOLD) {
    return {
      active: true,
      message: `You already have ${openHighPriority.length} high-priority open items. Completing them may create more career evidence than starting something new right now.`,
    };
  }
  return { active: false, message: null };
}

/** Spec ??45-46: every insight ends in an action, handed to Feature 36 via
 * the durable outbox rather than Feature 40 executing/tracking it itself. */
export async function dispatchStrategicActions(client: PoolClient, studentId: string, gaps: FutureGapCard[]): Promise<number> {
  const critical = gaps.filter((g) => g.severity === 'CRITICAL' && g.status === 'OPEN');
  for (const gap of critical) {
    await writeOutboxEvent(client, {
      eventType: 'FEATURE40.FUTURE_GAP.CRITICAL_OPENED',
      targetFeature: 'FEATURE36',
      studentId,
      payload: { futureGapId: gap.id, skillName: gap.skillName, recommendedAction: gap.recommendedAction, severity: gap.severity },
    });
  }
  return critical.length;
}
