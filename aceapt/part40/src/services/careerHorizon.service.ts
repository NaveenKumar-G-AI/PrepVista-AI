import { PoolClient } from 'pg';
import { CareerBranch, CareerHorizonResponse } from '../types/feature40.types';
import * as feature34 from '../integrations/feature34.adapter';
import * as feature37 from '../integrations/feature37.adapter';
import * as marketIntel from './marketIntelligence.service';
import { getOpenFutureGaps } from './futureGap.service';
import { getRoleEvolution } from './roleEvolution.service';
import { computeCareerBranching, computeFutureReadiness } from './careerPaths.service';
import { buildLearningPriorities, buildProjectRecommendations, computeFocusMode } from './actionEngine.service';

/**
 * The hero screen (spec ??7-8, ??71, ??103): CURRENT / MARKET / FUTURE /
 * YOUR GAP / NEXT MOVE. Every field here is read from data other services
 * already computed and stored -- this function does no classification of its
 * own, only assembly and the no-data/discovery-mode branching (spec ??86-87).
 */
export async function getCareerHorizon(client: PoolClient, studentId: string, period: string): Promise<CareerHorizonResponse> {
  const targetRoles = await feature34.getAllTargetRoles(client, studentId);
  const primary = targetRoles.find((r) => r.priority === Math.min(...targetRoles.map((t) => t.priority))) ?? null;

  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  const noEvidence = evidenceMap.size === 0;

  if (!primary) {
    const discoveryDirections = await discoverDirections(client, studentId, evidenceMap);
    return {
      studentId, hasTargetRole: false, targetRole: null,
      current: { capabilities: Array.from(evidenceMap.values()).map((e) => e.skillName), evidenceCount: evidenceMap.size, readiness: null },
      market: { signals: [], changedSincePriorPeriod: [] },
      roleEvolution: null, futureGaps: [],
      strategicPriorities: { learning: [], projects: [], focusModeActive: false, focusModeMessage: null },
      futurePaths: [], discoveryMode: true, discoveryDirections,
      emptyStates: {
        noTargetRole: 'Your Career Horizon needs a target direction. Explore possible paths below to begin.',
        noEvidence: noEvidence ? 'Your future analysis will become more precise as you build demonstrable evidence.' : null,
        noMarketData: null,
      },
    };
  }

  const snapshots = await marketIntel.getSnapshots(client, primary.roleId, 1);
  const noMarketData = snapshots.length === 0;

  if (noMarketData) {
    return {
      studentId, hasTargetRole: true, targetRole: { id: primary.roleId, title: primary.roleTitle },
      current: { capabilities: Array.from(evidenceMap.values()).map((e) => e.skillName), evidenceCount: evidenceMap.size, readiness: await computeFutureReadiness(client, studentId, primary.roleId) },
      market: { signals: [], changedSincePriorPeriod: [] },
      roleEvolution: null, futureGaps: [],
      strategicPriorities: { learning: [], projects: [], focusModeActive: false, focusModeMessage: null },
      futurePaths: [], discoveryMode: false, discoveryDirections: null,
      emptyStates: {
        noTargetRole: null,
        noEvidence: noEvidence ? 'Your future analysis will become more precise as you build demonstrable evidence.' : null,
        noMarketData: 'Current market evidence is insufficient for a reliable analysis of this role yet.',
      },
    };
  }

  const [signals, changed, gaps, roleEvolution, futurePaths, readiness] = await Promise.all([
    marketIntel.getMarketSignalsForRole(client, primary.roleId, period),
    marketIntel.whatChanged(client, primary.roleId),
    getOpenFutureGaps(client, studentId, primary.roleId),
    getRoleEvolution(client, primary.roleId, period),
    computeCareerBranching(client, studentId, primary.roleId, primary.roleTitle, period),
    computeFutureReadiness(client, studentId, primary.roleId),
  ]);

  const learning = await buildLearningPriorities(client, studentId, gaps);
  const projects = await buildProjectRecommendations(client, primary.roleTitle, gaps);
  const focusMode = computeFocusMode(gaps);

  return {
    studentId, hasTargetRole: true, targetRole: { id: primary.roleId, title: primary.roleTitle },
    current: { capabilities: Array.from(evidenceMap.values()).map((e) => e.skillName), evidenceCount: evidenceMap.size, readiness },
    market: { signals, changedSincePriorPeriod: changed },
    roleEvolution, futureGaps: gaps,
    strategicPriorities: { learning, projects, focusModeActive: focusMode.active, focusModeMessage: focusMode.message },
    futurePaths, discoveryMode: false, discoveryDirections: null,
    emptyStates: { noTargetRole: null, noEvidence: noEvidence ? 'Your future analysis will become more precise as you build demonstrable evidence.' : null, noMarketData: null },
  };
}

/** Spec ??41-42 Career Discovery: when there's no clear target, suggest
 * candidate directions from skill-overlap with the student's OWN strongest
 * evidence -- not a fixed "everyone sees these 4 roles" list. */
async function discoverDirections(
  client: PoolClient,
  studentId: string,
  evidenceMap: Awaited<ReturnType<typeof feature37.getEvidenceMap>>
): Promise<CareerBranch[]> {
  if (evidenceMap.size === 0) return [];
  const evidenceSlugs = new Set(evidenceMap.keys());

  const { rows: roles } = await client.query(`SELECT id, title FROM roles`);
  const scored: { roleId: string; roleTitle: string; overlap: number; matched: string[] }[] = [];

  for (const role of roles) {
    const snaps = await marketIntel.getSnapshots(client, role.id, 1);
    if (snaps.length === 0) continue;
    const freq = snaps[snaps.length - 1].skillFrequencies;
    const roleSkills = Object.keys(freq).filter((k) => freq[k] >= 0.15);
    const matched = roleSkills.filter((s) => evidenceSlugs.has(s));
    if (matched.length === 0) continue;
    scored.push({ roleId: role.id, roleTitle: role.title, overlap: matched.length / roleSkills.length, matched });
  }

  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, 4).map((s) => ({
    category: 'EXPLORATORY' as const,
    roleId: s.roleId, roleTitle: s.roleTitle,
    whyItFits: `${s.matched.length} of your evidenced skills (${s.matched.map((slug) => evidenceMap.get(slug)?.skillName ?? slug).join(', ')}) are core expectations for this role.`,
    transferableSkills: s.matched.map((slug) => evidenceMap.get(slug)?.skillName ?? slug),
    gaps: [],
    requiredEvidence: [],
    marketDirection: 'UNCERTAIN' as const,
  }));
}
