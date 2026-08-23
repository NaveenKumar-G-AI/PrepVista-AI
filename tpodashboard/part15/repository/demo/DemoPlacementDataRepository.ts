/**
 * PrepVista AI — Part 15
 *
 * In-memory reference implementation of PlacementDataRepository, backed by the
 * synthetic dataset in seed.ts. Exists to make the service layer runnable and
 * testable without a real database. See docs/PART15_INTEGRATION.md for how to
 * replace this with a real implementation.
 *
 * The one piece of real behavior worth reading closely: `LATE_JOINING_BATCH`.
 * It simulates 4 joining confirmations that were recorded two days AFTER the
 * stated data cutoff (2026-08-13). Every asOf-aware method below only reveals
 * that batch when `asOf` is on/after its record date. This is what
 * tests/forecast/leakage.test.ts exercises — it proves that asking for a
 * forecast "as of 13 Aug" cannot see data that didn't exist yet on 13 Aug,
 * even though the demo process has that data in memory the whole time.
 */

import type {
  Company,
  CompanyConcentration,
  CurrentSeasonSnapshot,
  Department,
  DepartmentSeasonState,
  Drive,
  PlacementTarget,
  SeasonSummary,
  Student,
} from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../PlacementDataRepository.js";
import {
  COMPANIES,
  CURRENT_SEASON_ID,
  CURRENT_SEASON_OFFERS_BY_COMPANY,
  CURRENT_TARGET,
  DEPARTMENTS,
  DRIVES,
  HISTORICAL_SEASONS,
  buildCurrentSeasonSnapshot,
  buildDepartmentSeasonState,
  buildStudents,
} from "./seed.js";

const LATE_JOINING_BATCH = {
  recordedAt: "2026-08-15",
  count: 4,
  departmentId: "CSE",
};

function includesLateBatch(asOf: string): boolean {
  return asOf >= LATE_JOINING_BATCH.recordedAt;
}

export class DemoPlacementDataRepository implements PlacementDataRepository {
  private readonly institutionId = "demo-institution";

  getInstitutionId(): string {
    return this.institutionId;
  }

  async getDepartments(): Promise<Department[]> {
    return DEPARTMENTS;
  }

  async getHistoricalSeasonSummaries(): Promise<SeasonSummary[]> {
    // Only completed seasons — the in-progress season is never returned here,
    // which is what keeps a naive "average of all seasons" query from leaking
    // partial current-season data into a historical baseline.
    return HISTORICAL_SEASONS;
  }

  async getCurrentSeasonSnapshot(asOf: string): Promise<CurrentSeasonSnapshot> {
    const snapshot = buildCurrentSeasonSnapshot(asOf);
    if (includesLateBatch(asOf)) {
      snapshot.verifiedPlacements += LATE_JOINING_BATCH.count;
      const bucket = snapshot.remainingPool.find((b) => b.status === "OFFER_ACCEPTED_AWAITING_JOIN");
      if (bucket) bucket.count = Math.max(0, bucket.count - LATE_JOINING_BATCH.count);
    }
    return snapshot;
  }

  async getDepartmentSeasonState(departmentId: string, seasonId: string, asOf: string): Promise<DepartmentSeasonState> {
    if (seasonId !== CURRENT_SEASON_ID) {
      throw new Error(`Demo repository only carries granular department state for the current season (${CURRENT_SEASON_ID}).`);
    }
    const state = buildDepartmentSeasonState(departmentId, asOf);
    if (departmentId === LATE_JOINING_BATCH.departmentId && includesLateBatch(asOf)) {
      state.verifiedPlacements += LATE_JOINING_BATCH.count;
      const bucket = state.remainingPool.find((b) => b.status === "OFFER_ACCEPTED_AWAITING_JOIN");
      if (bucket) bucket.count = Math.max(0, bucket.count - LATE_JOINING_BATCH.count);
    }
    return state;
  }

  async getActiveTarget(seasonId: string, metric: PlacementTarget["metric"]): Promise<PlacementTarget | null> {
    if (seasonId === CURRENT_TARGET.seasonId && metric === CURRENT_TARGET.metric && CURRENT_TARGET.status === "ACTIVE") {
      return CURRENT_TARGET;
    }
    return null;
  }

  async getStudents(asOf: string): Promise<Student[]> {
    const students = buildStudents();
    if (includesLateBatch(asOf)) {
      let flipped = 0;
      for (const s of students) {
        if (flipped >= LATE_JOINING_BATCH.count) break;
        if (s.departmentId === LATE_JOINING_BATCH.departmentId && s.status === "OFFER_ACCEPTED") {
          s.status = "PLACED";
          flipped++;
        }
      }
    }
    return students;
  }

  async getStudentById(studentId: string, asOf: string): Promise<Student | null> {
    const students = await this.getStudents(asOf);
    return students.find((s) => s.id === studentId) ?? null;
  }

  async getCompanies(): Promise<Company[]> {
    return COMPANIES;
  }

  async getActiveDrives(seasonId: string): Promise<Drive[]> {
    return DRIVES.filter((d) => d.seasonId === seasonId && d.status === "OPEN");
  }

  async getCurrentSeasonId(): Promise<string> {
    return CURRENT_SEASON_ID;
  }

  async getCompanyConcentration(seasonId: string, topN: number): Promise<CompanyConcentration> {
    if (seasonId !== CURRENT_SEASON_ID) {
      throw new Error(`Demo repository only has current-season offer attribution (${CURRENT_SEASON_ID}).`);
    }
    const entries = Object.entries(CURRENT_SEASON_OFFERS_BY_COMPANY).filter(([, count]) => count > 0);
    const total = entries.reduce((s, [, count]) => s + count, 0);
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, topN);
    const topSum = top.reduce((s, [, count]) => s + count, 0);
    const byId = new Map(COMPANIES.map((c) => [c.id, c]));
    return {
      topNCompanies: top.map(([id, count]) => ({
        companyId: id,
        name: byId.get(id)?.name ?? id,
        offerShare: total > 0 ? count / total : 0,
      })),
      topNShareOfTotalOffers: total > 0 ? topSum / total : 0,
      n: topN,
      totalActiveCompanies: entries.length,
      note: "Observed concentration among companies with verified offers this season. Neither high nor low concentration is automatically good or bad — read alongside diversification trend and industry mix.",
    };
  }
}
