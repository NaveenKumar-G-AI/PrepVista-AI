/**
 * PrepVista AI — Part 15
 *
 * PlacementDataRepository
 * ────────────────────────
 * This is the ONLY seam Part 15's services talk to for data. Every method
 * takes an explicit `asOf` cutoff and MUST NOT return any record dated after
 * it — this is the load-bearing contract for Section 19 (Data Leakage
 * Prevention). A real implementation backed by Postgres/Prisma/etc. should
 * enforce the cutoff in the query itself (e.g. `WHERE recorded_at <= $asOf`),
 * not by filtering in application code after the fact.
 *
 * INTEGRATION: implement this interface against your real Parts 1-14 schema
 * and swap it in wherever `DemoPlacementDataRepository` is constructed today.
 * Nothing in services/, api/, or modules/ imports the demo implementation
 * directly except the demo bootstrap — see repository/demo/seed.ts for the
 * shape of data a real implementation needs to be able to produce.
 */

import type {
  CompanyConcentration,
  CurrentSeasonSnapshot,
  Department,
  DepartmentSeasonState,
  Drive,
  Company,
  PlacementTarget,
  SeasonSummary,
  Student,
} from "../types/placement-strategy.types.js";

export interface PlacementDataRepository {
  getInstitutionId(): string;

  getDepartments(): Promise<Department[]>;

  /** Completed historical seasons only — never includes the in-progress season. */
  getHistoricalSeasonSummaries(): Promise<SeasonSummary[]>;

  /** The in-progress season's funnel snapshot as of the given cutoff. */
  getCurrentSeasonSnapshot(asOf: string): Promise<CurrentSeasonSnapshot>;

  getDepartmentSeasonState(departmentId: string, seasonId: string, asOf: string): Promise<DepartmentSeasonState>;

  getActiveTarget(seasonId: string, metric: PlacementTarget["metric"]): Promise<PlacementTarget | null>;

  getStudents(asOf: string): Promise<Student[]>;

  getStudentById(studentId: string, asOf: string): Promise<Student | null>;

  getCompanies(): Promise<Company[]>;

  getActiveDrives(seasonId: string): Promise<Drive[]>;

  getCurrentSeasonId(): Promise<string>;

  /** Pre-computed company concentration is often cheap to derive from getCompanies() + offers, exposed here for demo/backtest convenience. */
  getCompanyConcentration(seasonId: string, topN: number): Promise<CompanyConcentration>;
}
