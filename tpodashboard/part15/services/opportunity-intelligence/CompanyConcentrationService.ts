/**
 * PrepVista AI — Part 15
 * Company + industry diversification intelligence — Section 31/32.
 * Thin, honest wrapper: concentration is reported neutrally, never
 * auto-labeled "bad" (Section 31 explicitly warns against that).
 */

import type { CompanyConcentration, IndustryConcentration } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { emitEvent } from "../../events/event-bus.js";

export class CompanyConcentrationService {
  constructor(private readonly repo: PlacementDataRepository) {}

  async getCompanyConcentration(topN = 5): Promise<CompanyConcentration> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const result = await this.repo.getCompanyConcentration(seasonId, topN);
    emitEvent("COMPANY_CONCENTRATION_UPDATED", { topNShareOfTotalOffers: result.topNShareOfTotalOffers, n: topN });
    return result;
  }

  async getIndustryConcentration(): Promise<IndustryConcentration[]> {
    const seasonId = await this.repo.getCurrentSeasonId();
    const companies = await this.repo.getCompanies();
    const concentration = await this.repo.getCompanyConcentration(seasonId, companies.length);
    const offersByCompany = new Map(concentration.topNCompanies.map((c) => [c.companyId, c.offerShare]));
    const byIndustry = new Map<string, number>();
    for (const c of companies) {
      const share = offersByCompany.get(c.id) ?? 0;
      byIndustry.set(c.industry, (byIndustry.get(c.industry) ?? 0) + share);
    }
    return [...byIndustry.entries()]
      .map(([industry, offerShare]) => ({ industry, offerSharePct: Math.round(offerShare * 1000) / 10, joiningSharePct: Math.round(offerShare * 1000) / 10, studentInterestScore: null }))
      .sort((a, b) => b.offerSharePct - a.offerSharePct);
  }
}
