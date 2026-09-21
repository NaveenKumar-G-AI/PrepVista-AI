import { repositories } from '../repositories';
import { integrations } from '../integrations';
import { cohortService } from './cohort.service';
import { computeCoverage } from '../core/coverage';
import {
  buildMasteryDistribution,
  dominantLevel,
  buildReadinessDistribution,
  computeTrend,
  classifyGapPriority,
} from '../core/distribution';
import { rankTrainingPriorities, classifyInterventions } from '../core/prioritization';
import { MasteryLevel, TrendDirection } from '../domain/enums';
import type { SkillAggregate, RoleAggregate, TrainingInsight, RequiredSkillGap } from '../domain/types';
import { logger } from '../utils/logger';

const SOURCE_VERSION = 'feature36-aggregation-v1';

/**
 * Section 33-37: this is what an aggregation job (queued, triggered by
 * events, or run on demand) actually does. It's synchronous/pull-based
 * here for clarity and testability — the async/event-driven path just
 * calls recomputeAll from a queue handler (see src/events/handlers.ts).
 */
export const aggregationService = {
  async recomputeCohortSkills(organizationId: string, cohortId: string): Promise<SkillAggregate[]> {
    const studentIds = await repositories.memberships.listStudentIds(organizationId, cohortId);
    const knownSkills = await integrations.skillSignals.listKnownSkills(organizationId);
    const signals = await integrations.skillSignals.getSkillSignalsForStudents(organizationId, studentIds);

    const results: Omit<SkillAggregate, 'id'>[] = [];
    for (const skill of knownSkills) {
      const skillSignals = signals.filter((s) => s.skillId === skill.skillId);
      const withEvidence = skillSignals.filter((s) => s.hasEvidence);
      const coverage = computeCoverage(studentIds.length, withEvidence.length);
      const distribution = buildMasteryDistribution(skillSignals.map((s) => s.level));
      const dominant = dominantLevel(distribution, coverage);

      const [previous] = await repositories.skillAggregates.listHistoryForSkill(organizationId, cohortId, skill.skillId, 1);
      const previousShare = previous
        ? (previous.distribution[MasteryLevel.PROFICIENT] + previous.distribution[MasteryLevel.STRONG]) /
          Math.max(previous.studentsWithEvidence, 1)
        : null;
      const currentShare = withEvidence.length
        ? (distribution[MasteryLevel.PROFICIENT] + distribution[MasteryLevel.STRONG]) / withEvidence.length
        : null;
      const trend = computeTrend({
        previousProficientShare: previousShare,
        currentProficientShare: currentShare,
        previousCoverage: previous ? computeCoverage(previous.eligibleStudents, previous.studentsWithEvidence) : null,
        currentCoverage: coverage,
      });

      results.push({
        organizationId,
        cohortId,
        skillId: skill.skillId,
        skillName: skill.skillName,
        eligibleStudents: coverage.eligibleStudents,
        studentsWithEvidence: coverage.studentsWithEvidence,
        coveragePct: coverage.coveragePct,
        coverageState: coverage.coverageState,
        distribution,
        dominantLevel: dominant,
        trend: trend.direction,
        // Confidence intentionally mirrors coverage for now — a simple,
        // explainable default. See docs/ARCHITECTURE.md for how to fold
        // in assessment recency once that signal is available.
        confidence: coverage.coveragePct,
        sourceVersion: SOURCE_VERSION,
        computedAt: new Date(),
      });
    }

    return repositories.skillAggregates.upsertMany(results);
  },

  async recomputeCohortRoles(organizationId: string, cohortId: string): Promise<RoleAggregate[]> {
    const studentIds = await repositories.memberships.listStudentIds(organizationId, cohortId);
    const knownRoles = await integrations.roleReadiness.listSupportedRoles(organizationId);
    const readiness = await integrations.roleReadiness.getRoleReadinessForStudents(organizationId, studentIds);

    const results: Omit<RoleAggregate, 'id'>[] = [];
    for (const role of knownRoles) {
      const roleSignals = readiness.filter((r) => r.roleId === role.roleId);
      const withEvidence = roleSignals.filter((r) => r.hasEvidence);
      const coverage = computeCoverage(studentIds.length, withEvidence.length);
      const distribution = buildReadinessDistribution(roleSignals.map((r) => r.state));

      const gapCounts = new Map<string, { skillName: string; deficientCount: number }>();
      for (const r of roleSignals) {
        for (const gap of r.requiredSkillGaps) {
          if (!gap.deficient) continue;
          const entry = gapCounts.get(gap.skillId) ?? { skillName: gap.skillName, deficientCount: 0 };
          entry.deficientCount += 1;
          gapCounts.set(gap.skillId, entry);
        }
      }
      const requiredSkillGaps: RequiredSkillGap[] = [...gapCounts.entries()].map(([skillId, v]) => ({
        skillId,
        skillName: v.skillName,
        gapPriority: classifyGapPriority({
          roleImportance: 0.7,
          observedProficiencyShare: withEvidence.length ? 1 - v.deficientCount / withEvidence.length : 0,
          placementRelevance: 0.7,
          affectedStudents: v.deficientCount,
          coverage,
        }),
      }));

      results.push({
        organizationId,
        cohortId,
        roleId: role.roleId,
        roleName: role.roleName,
        eligibleStudents: coverage.eligibleStudents,
        studentsWithEvidence: coverage.studentsWithEvidence,
        coveragePct: coverage.coveragePct,
        coverageState: coverage.coverageState,
        readinessDistribution: distribution,
        requiredSkillGaps,
        // Multi-period role-readiness trend needs readiness history,
        // which mirrors the skill-trend approach above; left as a
        // documented extension point rather than half-implemented here.
        trend: TrendDirection.INSUFFICIENT_EVIDENCE,
        confidence: coverage.coveragePct,
        sourceVersion: SOURCE_VERSION,
        computedAt: new Date(),
      });
    }

    return repositories.roleAggregates.upsertMany(results);
  },

  async recomputeTrainingInsights(organizationId: string, cohortId: string): Promise<TrainingInsight[]> {
    const skills = await repositories.skillAggregates.listLatestForCohort(organizationId, cohortId);
    const studentIds = await repositories.memberships.listStudentIds(organizationId, cohortId);
    const recommended = await integrations.nextBestAction.getRecommendedFocusAreas(organizationId, studentIds);

    const priorityInputs = skills.map((skill) => {
      const coverage = computeCoverage(skill.eligibleStudents, skill.studentsWithEvidence);
      const proficientShare = skill.studentsWithEvidence
        ? (skill.distribution[MasteryLevel.PROFICIENT] + skill.distribution[MasteryLevel.STRONG]) / skill.studentsWithEvidence
        : 0;
      const affectedStudents = Math.max(
        skill.eligibleStudents - skill.distribution[MasteryLevel.PROFICIENT] - skill.distribution[MasteryLevel.STRONG],
        0
      );
      const gapPriority = classifyGapPriority({
        roleImportance: 0.6,
        observedProficiencyShare: proficientShare,
        placementRelevance: 0.6,
        affectedStudents,
        coverage,
      });
      const impact = recommended.find((r) => r.skillId === skill.skillId)?.trainingImpactPotential ?? 0.5;

      return {
        skillId: skill.skillId,
        label: skill.skillName,
        gapPriority,
        affectedStudents,
        roleImportance: 0.6,
        trainingImpactPotential: impact,
      };
    });

    const ranked = rankTrainingPriorities(priorityInputs);

    const insights: Omit<TrainingInsight, 'id'>[] = ranked.map((r, index) => {
      const skill = skills.find((s) => s.skillId === r.skillId);
      const interventionCategories = skill
        ? classifyInterventions({
            distribution: skill.distribution,
            // Extension point: wire the real interview-verification
            // rate once Technical Interview Integration is connected.
            interviewVerificationRate: 0.5,
            roleSpecificGap: false,
          })
        : [];
      return {
        organizationId,
        cohortId,
        skillId: r.skillId,
        label: r.label,
        gapPriority: r.gapPriority,
        interventionCategories,
        affectedStudents: r.affectedStudents,
        rationale: r.rationale,
        priorityRank: index + 1,
        sourceVersion: SOURCE_VERSION,
        computedAt: new Date(),
      };
    });

    return repositories.trainingInsights.replaceForCohort(organizationId, cohortId, insights);
  },

  async recomputeAll(organizationId: string, cohortId: string): Promise<void> {
    await cohortService.get(organizationId, cohortId); // tenant + existence guard
    await this.recomputeCohortSkills(organizationId, cohortId);
    await this.recomputeCohortRoles(organizationId, cohortId);
    await this.recomputeTrainingInsights(organizationId, cohortId);
    logger.info({ organizationId, cohortId }, 'Cohort aggregation recomputed.');
  },
};
