/**
 * PrepVista AI — Part 15
 *
 * GapAnalysisService — Section 14/35 ("Target Gap Explanation" / "Strategic
 * Gap Engine"). Explains WHERE the target gap concentrates without double
 * counting.
 *
 * Design choice worth reading before changing this file: the four
 * engagement-status buckets on CurrentSeasonSnapshot.remainingPool
 * (OFFER_ACCEPTED_AWAITING_JOIN / IN_INTERVIEW_STAGE / APPLIED_AWAITING_INTERVIEW
 * / NO_ACTIVE_APPLICATION) are a MUTUALLY EXCLUSIVE partition of the unplaced
 * student pool — every unplaced student is in exactly one bucket. Each bucket
 * is mapped to one funnel-stage label:
 *
 *   NO_ACTIVE_APPLICATION        -> APPLICATION_CONVERSION (need to apply)
 *   APPLIED_AWAITING_INTERVIEW   -> INTERVIEW_CONVERSION    (need to reach/clear interviews)
 *   IN_INTERVIEW_STAGE           -> OFFER_ACCEPTANCE        (need interviews to become accepted offers)
 *   OFFER_ACCEPTED_AWAITING_JOIN -> JOINING_CONVERSION       (need offers to become verified joins)
 *
 * Because the buckets don't overlap, contribution = count × (benchmarkRate -
 * historicalRate) for each bucket sums EXACTLY with no interaction term to
 * hide — unlike a sequential multiplicative funnel, there's no double-counting
 * risk here by construction. The one place uncertainty still enters is
 * whether hitting every benchmark would actually close the REQUIRED gap
 * (Section 13); that comparison is surfaced explicitly as a residual rather
 * than silently forced to reconcile.
 */

import type { EngagementStatus, StageContribution, TargetGapExplanation } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { TargetService } from "./TargetService.js";
import { round1 } from "../forecast/stats.js";

const BUCKET_TO_STAGE: Record<EngagementStatus, StageContribution["stage"]> = {
  NO_ACTIVE_APPLICATION: "APPLICATION_CONVERSION",
  APPLIED_AWAITING_INTERVIEW: "INTERVIEW_CONVERSION",
  IN_INTERVIEW_STAGE: "OFFER_ACCEPTANCE",
  OFFER_ACCEPTED_AWAITING_JOIN: "JOINING_CONVERSION",
};

/**
 * Institution-configured "achievable" eventual-join rates per bucket — what
 * the TPO believes is realistically reachable with focused effort, as
 * opposed to `historicalEventualJoinRate` which is what has actually
 * happened. Demo defaults shown; production should store these alongside
 * the PlacementTarget as institution-configurable values (Section 12).
 */
export const BENCHMARK_EVENTUAL_JOIN_RATE: Record<EngagementStatus, number> = {
  OFFER_ACCEPTED_AWAITING_JOIN: 0.95,
  IN_INTERVIEW_STAGE: 0.45,
  APPLIED_AWAITING_INTERVIEW: 0.22,
  NO_ACTIVE_APPLICATION: 0.08,
};

export class GapAnalysisService {
  private readonly targetService: TargetService;

  constructor(private readonly repo: PlacementDataRepository) {
    this.targetService = new TargetService(repo);
  }

  async explainGap(asOf: string): Promise<TargetGapExplanation | null> {
    const [gapSummary, snapshot] = await Promise.all([this.targetService.getTargetGapSummary(asOf), this.repo.getCurrentSeasonSnapshot(asOf)]);
    if (!gapSummary) return null;

    const stageContributions: StageContribution[] = snapshot.remainingPool.map((bucket) => {
      const benchmarkRate = BENCHMARK_EVENTUAL_JOIN_RATE[bucket.status];
      const contribution = bucket.count * (benchmarkRate - bucket.historicalEventualJoinRate);
      return {
        stage: BUCKET_TO_STAGE[bucket.status],
        observedRate: bucket.historicalEventualJoinRate,
        benchmarkRate,
        observedContributionStudents: round1(contribution),
        affectedStudents: bucket.count,
        label: "Observed contribution area",
      };
    });

    const pipelineBaselineProjected = snapshot.remainingPool.reduce((sum, b) => sum + b.count * b.historicalEventualJoinRate, 0);
    const totalIfAllBenchmarksHit = pipelineBaselineProjected + stageContributions.reduce((s, c) => s + c.observedContributionStudents, 0);
    const unattributedResidualStudents = round1(gapSummary.requiredAdditionalPlacements - totalIfAllBenchmarksHit);

    const note =
      unattributedResidualStudents > 0.5
        ? `Even if every stage above hit its benchmark rate, the projected additional placements (${round1(totalIfAllBenchmarksHit)}) would still fall short of the ${gapSummary.requiredAdditionalPlacements} needed by about ${unattributedResidualStudents} students — closing the full gap likely requires additional levers beyond improving these four stages (e.g. more drives, opportunity coverage — see run_scenario and get_opportunity_coverage).`
        : unattributedResidualStudents < -0.5
        ? `Hitting every benchmark rate above would be more than sufficient to close the target gap (projected surplus of about ${Math.abs(unattributedResidualStudents)} students) — the benchmarks are not all equally urgent to pursue simultaneously.`
        : `Hitting these benchmark rates would almost exactly close the target gap.`;

    return {
      gapSummary,
      stageContributions,
      unattributedResidualStudents,
      note,
    };
  }
}
