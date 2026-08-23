/**
 * PrepVista AI — Part 15
 * StrategicGapService — Section 35. Assembles the six named gap types from
 * signals already computed elsewhere, rather than re-deriving them —
 * each gap type here is a thin, evidenced view over another service's output.
 */

import type { StrategicGap } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { GapAnalysisService } from "./GapAnalysisService.js";
import { OpportunityCoverageService, READY_THRESHOLD } from "../opportunity-intelligence/OpportunityCoverageService.js";
import { SkillSupplyDemandService } from "../opportunity-intelligence/SkillSupplyDemandService.js";
import { round1 } from "../forecast/stats.js";

export class StrategicGapService {
  private readonly gapAnalysis: GapAnalysisService;
  private readonly coverage: OpportunityCoverageService;
  private readonly skills: SkillSupplyDemandService;

  constructor(private readonly repo: PlacementDataRepository) {
    this.gapAnalysis = new GapAnalysisService(repo);
    this.coverage = new OpportunityCoverageService(repo);
    this.skills = new SkillSupplyDemandService(repo);
  }

  async getStrategicGaps(asOf: string): Promise<StrategicGap[]> {
    const [gapExplanation, coverage, skillDemand, snapshot, students] = await Promise.all([
      this.gapAnalysis.explainGap(asOf),
      this.coverage.getCoverage(asOf),
      this.skills.getSkillDemandSupply(asOf),
      this.repo.getCurrentSeasonSnapshot(asOf),
      this.repo.getStudents(asOf),
    ]);

    const gaps: StrategicGap[] = [];

    if (gapExplanation) {
      const worst = [...gapExplanation.stageContributions].sort((a, b) => Math.abs(b.observedContributionStudents) - Math.abs(a.observedContributionStudents))[0];
      if (worst && Math.abs(worst.observedContributionStudents) >= 2) {
        gaps.push({
          type: "FUNNEL_GAP",
          description: `Largest observed funnel bottleneck: ${worst.stage.toLowerCase().replace(/_/g, " ")}.`,
          evidence: [`Observed ${round1(worst.observedRate * 100)}% vs benchmark ${round1(worst.benchmarkRate * 100)}%.`],
          affectedStudents: worst.affectedStudents,
        });
      }
    }

    const offerAcceptedBucket = snapshot.remainingPool.find((b) => b.status === "OFFER_ACCEPTED_AWAITING_JOIN");
    if (offerAcceptedBucket && offerAcceptedBucket.count > 0) {
      gaps.push({
        type: "JOINING_GAP",
        description: "Accepted offers without a confirmed joining date.",
        evidence: [`${offerAcceptedBucket.count} students have accepted an offer but joining is not yet verified.`],
        affectedStudents: offerAcceptedBucket.count,
      });
    }

    if (coverage.unmatched > 0) {
      gaps.push({
        type: "OPPORTUNITY_GAP",
        description: "Placement-ready students with no matching active opportunity.",
        evidence: [`${coverage.unmatched} of ${coverage.readyStudents} ready students unmatched.`],
        affectedStudents: coverage.unmatched,
      });
    }

    const worstSkillGap = [...skillDemand].filter((s) => s.gap > 0).sort((a, b) => b.gap - a.gap)[0];
    if (worstSkillGap) {
      gaps.push({
        type: "SKILL_GAP",
        description: `Demand for '${worstSkillGap.skill}' currently exceeds student supply meeting the threshold.`,
        evidence: [`${worstSkillGap.activeRoleDemand} active role seats vs ${worstSkillGap.studentsMeetingThreshold} students with this skill.`],
        affectedStudents: worstSkillGap.gap,
      });
    }

    const notYetReady = students.filter((s) => s.status !== "PLACED" && s.readinessScore < READY_THRESHOLD).length;
    if (notYetReady > 0) {
      gaps.push({
        type: "STUDENT_GAP",
        description: "Students not yet at the readiness threshold to be considered placement-ready.",
        evidence: [`${notYetReady} unplaced students currently score below the readiness threshold (${READY_THRESHOLD}).`],
        affectedStudents: notYetReady,
      });
    }

    if (snapshot.dataQualityFlags.length > 0) {
      gaps.push({
        type: "DATA_GAP",
        description: "Incomplete institutional records affecting forecast/gap confidence.",
        evidence: snapshot.dataQualityFlags,
        affectedStudents: 0,
      });
    }

    return gaps;
  }
}
