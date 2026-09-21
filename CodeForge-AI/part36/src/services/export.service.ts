import { repositories } from '../repositories';
import { cohortService } from './cohort.service';
import { getCohortExecutiveOverview } from './dashboard.service';
import { ValidationError } from '../utils/errors';

export type ExportFormat = 'json' | 'csv';

/** Section 46: authorized exports. JSON and CSV are fully implemented;
 * PDF is a documented extension point — wire a rendering library
 * (e.g. pdfkit/puppeteer) and feed it the same report payload built
 * here rather than recomputing anything. */
export async function exportCohortReport(organizationId: string, cohortId: string, format: ExportFormat) {
  const cohort = await cohortService.get(organizationId, cohortId);
  const [overview, skills, roles, insights] = await Promise.all([
    getCohortExecutiveOverview(organizationId, cohortId),
    repositories.skillAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.roleAggregates.listLatestForCohort(organizationId, cohortId),
    repositories.trainingInsights.listForCohort(organizationId, cohortId),
  ]);

  const report = {
    cohort: { id: cohort.id, name: cohort.name },
    overview,
    skills,
    roles,
    trainingInsights: insights,
    generatedAt: new Date().toISOString(),
  };

  if (format === 'json') {
    return { contentType: 'application/json', body: JSON.stringify(report, null, 2) };
  }

  if (format === 'csv') {
    const header = 'skillName,coverageState,coveragePct,dominantLevel,trend';
    const rows = skills.map((s) =>
      [s.skillName, s.coverageState, s.coveragePct.toFixed(2), s.dominantLevel ?? '', s.trend].join(',')
    );
    return { contentType: 'text/csv', body: [header, ...rows].join('\n') };
  }

  throw new ValidationError(`Unsupported export format: ${format}`);
}
