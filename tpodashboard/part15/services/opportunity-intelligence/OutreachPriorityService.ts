/**
 * PrepVista AI — Part 15
 *
 * OutreachPriorityService — Section 33/34/70 (Recruiter Opportunity
 * Intelligence, TPO-side only — there is no recruiter-facing anything here).
 *
 * Scores companies that are NOT running an active drive this season, using
 * six explainable, individually-visible components (never an opaque "AI
 * score" — Section 34). Every score result is explicitly labeled a
 * recommendation, not a fact about future hiring intent (Section 33).
 */

import type { Company, OutreachPriority, OutreachPriorityScoreComponents } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { OpportunityCoverageService, isReady } from "./OpportunityCoverageService.js";
import { round1 } from "../forecast/stats.js";

const WEIGHTS = {
  pastHiring: 0.3,
  relationshipStrength: 0.15,
  studentSkillMatch: 0.2,
  departmentDemand: 0.15,
  recency: 0.1,
  opportunityGap: 0.1,
};

function totalHistoricalHires(c: Company): number {
  return Object.values(c.historicalHiresBySeason).reduce((s, n) => s + n, 0);
}

function seasonNum(id: string): number {
  const n = parseInt(id, 10);
  return Number.isNaN(n) ? 0 : n;
}

export class OutreachPriorityService {
  private readonly coverageService: OpportunityCoverageService;

  constructor(private readonly repo: PlacementDataRepository) {
    this.coverageService = new OpportunityCoverageService(repo);
  }

  async getOutreachPriorities(asOf: string): Promise<OutreachPriority[]> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const [companies, drives, students, coverage] = await Promise.all([
      this.repo.getCompanies(),
      this.repo.getActiveDrives(seasonId),
      this.repo.getStudents(asOf),
      this.coverageService.getCoverage(asOf),
    ]);

    const inactive = companies.filter((c) => c.lastActiveSeasonId !== seasonId);
    if (inactive.length === 0) return [];

    const unmatchedReady = students.filter((s) => isReady(s) && coverage.unmatchedStudentIds.includes(s.id));
    const maxHistoricalHires = Math.max(...inactive.map(totalHistoricalHires), 1);
    const currentSeasonNum = seasonNum(seasonId);

    return inactive
      .map((company) => {
        // Infer "typical" skills/departments for this inactive company from
        // ACTIVE companies in the same industry this season — a real signal
        // about what that industry is currently hiring for, used only as a
        // proxy since the inactive company has no current requirements on file.
        const peerDrives = drives.filter((d) => companies.find((c) => c.id === d.companyId)?.industry === company.industry);
        const typicalSkills = [...new Set(peerDrives.flatMap((d) => d.requiredSkills))];
        const typicalDepartments = [...new Set(peerDrives.flatMap((d) => d.eligibleDepartmentIds))];

        const pastHiring = round1(totalHistoricalHires(company) / maxHistoricalHires);
        const relationshipStrength = round1(company.relationshipStrength);

        const studentSkillMatch =
          typicalSkills.length === 0
            ? 0.5
            : round1(unmatchedReady.filter((s) => s.skillTags.some((sk) => typicalSkills.includes(sk))).length / Math.max(1, unmatchedReady.length));

        const departmentDemand =
          typicalDepartments.length === 0
            ? 0.5
            : round1(unmatchedReady.filter((s) => typicalDepartments.includes(s.departmentId)).length / Math.max(1, unmatchedReady.length));

        const seasonsSinceActive = company.lastActiveSeasonId ? currentSeasonNum - seasonNum(company.lastActiveSeasonId) : 5;
        const recency = round1(seasonsSinceActive <= 1 ? 0.8 : seasonsSinceActive === 2 ? 0.5 : 0.2);

        // How much of the current unmatched pool a company of this size could
        // plausibly absorb, using its historical average hires/season as a proxy for capacity.
        const avgHiresPerActiveSeason = totalHistoricalHires(company) / Math.max(1, Object.keys(company.historicalHiresBySeason).length);
        const opportunityGap = round1(Math.min(1, avgHiresPerActiveSeason / Math.max(1, coverage.unmatched)));

        const components: OutreachPriorityScoreComponents = { pastHiring, relationshipStrength, studentSkillMatch, departmentDemand, recency, opportunityGap };
        const score = round1(
          components.pastHiring * WEIGHTS.pastHiring +
            components.relationshipStrength * WEIGHTS.relationshipStrength +
            components.studentSkillMatch * WEIGHTS.studentSkillMatch +
            components.departmentDemand * WEIGHTS.departmentDemand +
            components.recency * WEIGHTS.recency +
            components.opportunityGap * WEIGHTS.opportunityGap
        );

        const priority: OutreachPriority["priority"] = score >= 0.6 ? "HIGH" : score >= 0.35 ? "MEDIUM" : "LOW";

        const evidence: string[] = [
          `${totalHistoricalHires(company)} historical hires across ${Object.keys(company.historicalHiresBySeason).length} season(s) on record.`,
          `No active drive this season (last active: ${company.lastActiveSeasonId ?? "never"}).`,
        ];
        if (typicalSkills.length > 0) evidence.push(`Industry peers currently hiring for: ${typicalSkills.join(", ")}.`);

        return {
          companyId: company.id,
          companyName: company.name,
          priority,
          score,
          components,
          evidence,
          disclaimer: "This is a recommendation for TPO outreach planning, not a fact about this company's future hiring intent.",
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}
