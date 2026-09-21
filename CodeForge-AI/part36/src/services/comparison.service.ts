import { repositories } from '../repositories';
import { cohortService } from './cohort.service';
import { assertComparable } from '../core/guards';
import { getCohortExecutiveOverview } from './dashboard.service';
import { ValidationError } from '../utils/errors';

// Extension point: once Role Readiness Engine / Assessment Engine
// expose their own version metadata, read these from there instead of
// hardcoding — see docs/ARCHITECTURE.md.
const ROLE_MODEL_VERSION = 'role-readiness-v1';
const ASSESSMENT_SCHEMA_VERSION = 'assessment-schema-v1';

export async function compareCohorts(organizationId: string, cohortIdA: string, cohortIdB: string) {
  if (cohortIdA === cohortIdB) throw new ValidationError('Cannot compare a cohort with itself.');

  const [cohortA, cohortB] = await Promise.all([
    cohortService.get(organizationId, cohortIdA),
    cohortService.get(organizationId, cohortIdB),
  ]);

  const [sizeA, sizeB, skillsA, skillsB] = await Promise.all([
    repositories.memberships.count(organizationId, cohortIdA),
    repositories.memberships.count(organizationId, cohortIdB),
    repositories.skillAggregates.listLatestForCohort(organizationId, cohortIdA),
    repositories.skillAggregates.listLatestForCohort(organizationId, cohortIdB),
  ]);

  const avgCoverage = (rows: { coveragePct: number }[]) =>
    rows.length ? rows.reduce((sum, r) => sum + r.coveragePct, 0) / rows.length : 0;

  const guard = assertComparable(
    {
      cohortId: cohortIdA,
      roleModelVersion: ROLE_MODEL_VERSION,
      assessmentSchemaVersion: ASSESSMENT_SCHEMA_VERSION,
      coveragePct: avgCoverage(skillsA),
      cohortSize: sizeA,
    },
    {
      cohortId: cohortIdB,
      roleModelVersion: ROLE_MODEL_VERSION,
      assessmentSchemaVersion: ASSESSMENT_SCHEMA_VERSION,
      coveragePct: avgCoverage(skillsB),
      cohortSize: sizeB,
    }
  );

  if (!guard.allowed) {
    return {
      comparable: false as const,
      reasons: guard.reasons,
      cohortA: { id: cohortA.id, name: cohortA.name },
      cohortB: { id: cohortB.id, name: cohortB.name },
    };
  }

  const [overviewA, overviewB] = await Promise.all([
    getCohortExecutiveOverview(organizationId, cohortIdA),
    getCohortExecutiveOverview(organizationId, cohortIdB),
  ]);

  return {
    comparable: true as const,
    cohortA: { id: cohortA.id, name: cohortA.name, overview: overviewA },
    cohortB: { id: cohortB.id, name: cohortB.name, overview: overviewB },
  };
}
