/**
 * PrepVista AI — Part 15
 * RecommendationEngine — Section 41/42. Every recommendation is scored as
 * impact × urgency × feasibility × confidence, with every factor visible in
 * `explanation` (never an opaque single number). Three sources feed
 * candidates: (1) the gap-attribution stage contributions, (2) departments
 * whose interview conversion trails the institutional median by a material
 * margin, (3) the opportunity coverage shortfall.
 */

import type { Role, StrategicRecommendation } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { GapAnalysisService } from "./GapAnalysisService.js";
import { OpportunityCoverageService } from "../opportunity-intelligence/OpportunityCoverageService.js";
import { MIN_DEPARTMENT_SAMPLE_SIZE } from "../forecast/thresholds.js";
import { clamp, mean, round1, round2 } from "../forecast/stats.js";
import { emitEvent } from "../../events/event-bus.js";

const STAGE_DESCRIPTION: Record<string, string> = {
  APPLICATION_CONVERSION: "getting not-yet-engaged students to apply",
  INTERVIEW_CONVERSION: "moving applicants into and through interviews",
  OFFER_ACCEPTANCE: "converting interviews into accepted offers",
  JOINING_CONVERSION: "converting accepted offers into confirmed joining",
};

const STAGE_FEASIBILITY: Record<string, number> = {
  APPLICATION_CONVERSION: 0.45, // requires behavior change from disengaged students — hardest lever
  INTERVIEW_CONVERSION: 0.55,
  OFFER_ACCEPTANCE: 0.6,
  JOINING_CONVERSION: 0.85, // chasing students who already accepted — most tractable
};

export class RecommendationEngine {
  private readonly gapService: GapAnalysisService;
  private readonly coverageService: OpportunityCoverageService;
  private readonly stageFeasibility: Record<string, number>;

  /**
   * PART15_HOSTILE_REVIEW.md finding F4: the default feasibility weights
   * below are this build's opinion, not a fact about any given institution
   * (some TPO teams find joining follow-up harder than interview prep, e.g.
   * if their offer-accepted students are largely off-campus by that point).
   * Pass `feasibilityOverrides` to replace any subset of the defaults.
   */
  constructor(private readonly repo: PlacementDataRepository, feasibilityOverrides: Partial<Record<string, number>> = {}) {
    this.gapService = new GapAnalysisService(repo);
    this.coverageService = new OpportunityCoverageService(repo);
    this.stageFeasibility = { ...STAGE_FEASIBILITY };
    for (const [stage, value] of Object.entries(feasibilityOverrides)) {
      if (value !== undefined) this.stageFeasibility[stage] = value;
    }
  }

  async getRecommendations(asOf: string, limit = 8): Promise<StrategicRecommendation[]> {
    const [gapExplanation, coverage, departments, snapshot] = await Promise.all([
      this.gapService.explainGap(asOf),
      this.coverageService.getCoverage(asOf),
      this.repo.getDepartments(),
      this.repo.getCurrentSeasonSnapshot(asOf),
    ]);

    const urgency = round2(clamp(0.3 + snapshot.fractionElapsed * 0.7, 0, 1));
    const candidates: StrategicRecommendation[] = [];
    let idCounter = 0;
    const owner: Role = "TPO";

    // ── Source 1: gap-attribution stage contributions ──
    if (gapExplanation) {
      // PART15_HOSTILE_REVIEW.md finding F3: impact must NOT be normalized
      // against the largest contribution in this same run — that construction
      // guarantees the top-ranked stage always shows impact≈1.0 even when the
      // institution is barely missing target, i.e. false urgency by
      // definition. Instead, scale against a stable reference: the actual
      // number of additional placements still needed (with a population-
      // scaled floor so the denominator doesn't collapse toward zero once the
      // gap is nearly closed).
      const stableDenominator = Math.max(gapExplanation.gapSummary.requiredAdditionalPlacements, snapshot.totalEligibleStudents * 0.01, 5);
      for (const c of gapExplanation.stageContributions) {
        if (Math.abs(c.observedContributionStudents) < 2) continue; // not material enough to surface
        const impact = round2(clamp(Math.abs(c.observedContributionStudents) / stableDenominator, 0, 1));
        const feasibility = this.stageFeasibility[c.stage] ?? 0.5;
        const confidence = round2(clamp(c.affectedStudents / 100, 0.3, 1));
        const priorityScore = round2(impact * urgency * feasibility * confidence);
        candidates.push({
          id: `rec-${++idCounter}`,
          issue: `Improve funnel stage: ${STAGE_DESCRIPTION[c.stage] ?? c.stage}`,
          evidence: [
            `Observed eventual-conversion rate ${round1(c.observedRate * 100)}% vs benchmark ${round1(c.benchmarkRate * 100)}%.`,
            `${c.affectedStudents} students currently in this stage.`,
          ],
          affectedStudents: c.affectedStudents,
          potentialImpact: `Scenario estimate: reaching the benchmark rate here contributes roughly ${Math.abs(c.observedContributionStudents)} additional verified placements (see run_scenario for a bespoke estimate).`,
          effortEstimate: feasibility >= 0.7 ? "LOW" : feasibility >= 0.5 ? "MEDIUM" : "HIGH",
          urgency,
          impact,
          feasibility,
          confidence,
          priorityScore,
          actionOwner: owner,
          explanation: `priority ${priorityScore} = impact ${impact} × urgency ${urgency} × feasibility ${feasibility} × confidence ${confidence}`,
        });
      }
    }

    // ── Source 2: departments trailing the institutional median interview conversion ──
    const eligibleDeptStates = await Promise.all(
      departments.map(async (d) => ({ dept: d, state: await this.repo.getDepartmentSeasonState(d.id, snapshot.seasonId, asOf) }))
    );
    const reliableStates = eligibleDeptStates.filter((x) => x.state.totalStudents >= MIN_DEPARTMENT_SAMPLE_SIZE);
    const medianInterviewConversion = median(reliableStates.map((x) => x.state.funnelRates.interviewConversion));

    for (const { dept, state } of reliableStates) {
      const gapVsMedian = medianInterviewConversion - state.funnelRates.interviewConversion;
      if (gapVsMedian < 0.06) continue; // only flag departments materially (6+ points) below median
      const unplaced = Math.max(0, state.totalStudents - state.verifiedPlacements);
      const impact = round2(clamp(gapVsMedian * 3, 0, 1)); // 6pt gap -> ~0.18, 20pt gap -> ~0.6, capped at 1
      const feasibility = 0.6;
      const confidence = round2(clamp(state.totalStudents / 200, 0.3, 1));
      const priorityScore = round2(impact * urgency * feasibility * confidence);
      candidates.push({
        id: `rec-${++idCounter}`,
        issue: `Improve ${dept.name} technical interview conversion`,
        evidence: [
          `${round1(state.funnelRates.interviewConversion * 100)}% vs institutional median ${round1(medianInterviewConversion * 100)}% (departments with ≥${MIN_DEPARTMENT_SAMPLE_SIZE} students).`,
          `${unplaced} students in this department not yet placed.`,
        ],
        affectedStudents: unplaced,
        potentialImpact: `Students who completed similar targeted interview-preparation programs in other departments showed higher observed interview progression — not asserted as causal here (Section 62).`,
        effortEstimate: "MEDIUM",
        urgency,
        impact,
        feasibility,
        confidence,
        priorityScore,
        actionOwner: owner,
        explanation: `priority ${priorityScore} = impact ${impact} × urgency ${urgency} × feasibility ${feasibility} × confidence ${confidence}`,
      });
    }

    // ── Source 3: opportunity coverage shortfall ──
    if (coverage.readyStudents > 0) {
      const unmatchedShare = coverage.unmatched / coverage.readyStudents;
      if (unmatchedShare > 0.15) {
        const impact = round2(clamp(unmatchedShare, 0, 1));
        const feasibility = 0.5;
        const confidence = 0.9;
        const priorityScore = round2(impact * urgency * feasibility * confidence);
        candidates.push({
          id: `rec-${++idCounter}`,
          issue: "Close opportunity coverage gap for ready students",
          evidence: [`${coverage.unmatched} of ${coverage.readyStudents} placement-ready students currently have no matching active opportunity.`],
          affectedStudents: coverage.unmatched,
          potentialImpact: "These students cannot be placed until a matching opportunity exists, regardless of readiness — prioritize opportunity creation and targeted outreach for their skill/department profile.",
          effortEstimate: "HIGH",
          urgency,
          impact,
          feasibility,
          confidence,
          priorityScore,
          actionOwner: owner,
          explanation: `priority ${priorityScore} = impact ${impact} × urgency ${urgency} × feasibility ${feasibility} × confidence ${confidence}`,
        });
      }
    }

    candidates.sort((a, b) => b.priorityScore - a.priorityScore);
    const top = candidates.slice(0, limit);
    for (const rec of top) emitEvent("STRATEGIC_RECOMMENDATION_CREATED", { id: rec.id, issue: rec.issue, priorityScore: rec.priorityScore });
    return top;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? mean([sorted[mid - 1]!, sorted[mid]!]) : sorted[mid]!;
}
