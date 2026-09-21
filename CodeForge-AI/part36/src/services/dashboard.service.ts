import { repositories } from '../repositories';
import { cohortService } from './cohort.service';
import { generateExecutiveNarrative } from '../ai/aiInsight.service';
import { GapPriority, FreshnessState, MasteryLevel, TrendDirection, ReadinessState } from '../domain/enums';
import type { CohortExecutiveOverview, FreshnessInfo } from '../domain/types';

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day

function computeFreshness(computedAt: Date | undefined): FreshnessInfo {
  if (!computedAt) return { state: FreshnessState.INSUFFICIENT_DATA, lastUpdated: null };
  const ageMs = Date.now() - computedAt.getTime();
  return {
    state: ageMs < FRESHNESS_WINDOW_MS ? FreshnessState.UPDATED_RECENTLY : FreshnessState.UPDATING,
    lastUpdated: computedAt,
  };
}

/**
 * Section 81 — the single most important product output: not charts,
 * but "what is happening, why, and what should we do next."
 */
export async function getCohortExecutiveOverview(organizationId: string, cohortId: string): Promise<CohortExecutiveOverview> {
  const cohort = await cohortService.get(organizationId, cohortId);
  const guard = await cohortService.checkPrivacyGuard(organizationId, cohortId);

  if (guard.restricted) {
    return {
      cohort: { id: cohort.id, name: cohort.name, kind: cohort.kind },
      freshness: { state: FreshnessState.INSUFFICIENT_DATA, lastUpdated: null },
      strongestAreas: [],
      priorityGaps: [],
      highestImpactRoleGap: null,
      trainingPriorities: [],
      evidenceCoverageSummary: {},
      observedGrowth: [],
      restricted: {
        reason: `Cohort has fewer than ${guard.minCohortSize} students; aggregate view is withheld to protect individual privacy.`,
      },
    };
  }

  const [skills, roles, insights] = await Promise.all([
    repositories.skillAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.roleAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.trainingInsights.listForCohort(organizationId, cohortId),
  ]);

  const strongestAreas = skills
    .filter((s) => s.dominantLevel === MasteryLevel.STRONG || s.dominantLevel === MasteryLevel.PROFICIENT)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((s) => s.skillName);

  const priorityGaps = insights
    .filter((i) => i.gapPriority === GapPriority.HIGH)
    .slice(0, 3)
    .map((i) => i.label);

  const roleReadyShare = (r: (typeof roles)[number]) =>
    r.readinessDistribution[ReadinessState.READY] + r.readinessDistribution[ReadinessState.NEAR_READY];
  const weakestRole = [...roles].sort((a, b) => roleReadyShare(a) - roleReadyShare(b))[0];

  const trainingPriorities = insights.slice(0, 5).map((i) => i.label);

  const observedGrowth = skills
    .filter((s) => s.trend === TrendDirection.IMPROVING)
    .map((s) => `${s.skillName} improving`)
    .concat(skills.filter((s) => s.trend === TrendDirection.STABLE).map((s) => `${s.skillName} relatively stable`))
    .slice(0, 4);

  const evidenceCoverageSummary: CohortExecutiveOverview['evidenceCoverageSummary'] = {};
  for (const s of skills) evidenceCoverageSummary[s.skillName] = s.coverageState;

  const latestComputedAt = [...skills.map((s) => s.computedAt), ...roles.map((r) => r.computedAt)].sort(
    (a, b) => b.getTime() - a.getTime()
  )[0];

  return {
    cohort: { id: cohort.id, name: cohort.name, kind: cohort.kind },
    freshness: computeFreshness(latestComputedAt),
    strongestAreas,
    priorityGaps,
    highestImpactRoleGap: weakestRole ? weakestRole.roleName : null,
    trainingPriorities,
    evidenceCoverageSummary,
    observedGrowth,
  };
}

export async function getCohortExecutiveOverviewWithNarrative(organizationId: string, cohortId: string) {
  const overview = await getCohortExecutiveOverview(organizationId, cohortId);
  if (overview.restricted) return { ...overview, narrative: null };

  const { narrative } = await generateExecutiveNarrative({
    cohortName: overview.cohort.name,
    strongestAreas: overview.strongestAreas,
    priorityGaps: overview.priorityGaps,
    highestImpactRoleGap: overview.highestImpactRoleGap,
    trainingPriorities: overview.trainingPriorities,
    evidenceCoverageSummary: overview.evidenceCoverageSummary,
    observedGrowth: overview.observedGrowth,
  });

  return { ...overview, narrative };
}

// ── Role-specific dashboard compositions (sections 43-45) ────────────
// "Department Intelligence" (section 17) is intentionally NOT a
// separate subsystem here — a department is just a cohort with
// kind=DEPARTMENT, so it's already served by the same overview/skills/
// roles endpoints. See docs/ARCHITECTURE.md.

export async function getTpoDashboard(organizationId: string, cohortId: string) {
  const [overview, roles, insights] = await Promise.all([
    getCohortExecutiveOverviewWithNarrative(organizationId, cohortId),
    repositories.roleAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.trainingInsights.listForCohort(organizationId, cohortId),
  ]);
  return { overview, roleReadiness: roles, trainingPriorities: insights };
}

export async function getTrainerDashboard(organizationId: string, cohortId: string) {
  const [skills, insights] = await Promise.all([
    repositories.skillAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.trainingInsights.listForCohort(organizationId, cohortId),
  ]);
  return { topGaps: insights.slice(0, 10), skillDistribution: skills };
}

export async function getAdminDashboard(organizationId: string) {
  const cohorts = await cohortService.list(organizationId);
  const summaries = await Promise.all(
    cohorts.map(async (c) => ({
      cohort: { id: c.id, name: c.name, kind: c.kind },
      overview: await getCohortExecutiveOverview(organizationId, c.id),
    }))
  );
  return { cohortCount: cohorts.length, cohorts: summaries };
}
