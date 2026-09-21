import { repositories } from '../repositories';
import { cohortService } from './cohort.service';
import { getCohortExecutiveOverview } from './dashboard.service';

const SCORING_METHODOLOGY_VERSION = 'feature36-aggregation-v1';

/** Section 37/78: append-only historical snapshots. Never overwritten,
 * so past cohort state stays correct even if scoring logic changes
 * later — a logic change should mint a NEW methodology version rather
 * than mutate old snapshots. */
export async function captureSnapshot(
  organizationId: string,
  cohortId: string,
  periodLabel: string,
  periodStart: Date,
  periodEnd: Date
) {
  await cohortService.get(organizationId, cohortId);
  const overview = await getCohortExecutiveOverview(organizationId, cohortId);
  return repositories.snapshots.create({
    organizationId,
    cohortId,
    periodLabel,
    periodStart,
    periodEnd,
    payload: overview,
    scoringMethodologyVersion: SCORING_METHODOLOGY_VERSION,
  });
}

export async function listSnapshots(organizationId: string, cohortId: string) {
  await cohortService.get(organizationId, cohortId);
  return repositories.snapshots.list(organizationId, cohortId);
}
