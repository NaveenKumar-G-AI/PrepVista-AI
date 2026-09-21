import type { GrowthEvidence, GrowthSnapshot, GrowthMilestone, GrowthInsight, GrowthDimension } from "../types.ts";

/**
 * Everything above this interface (the engine, the API layer) depends only
 * on this contract, never on Postgres/Supabase specifics. `postgresRepository.ts`
 * is the one real implementation in this reference build; swap in whatever
 * your actual data layer looks like without touching engine code.
 */
export interface GrowthRepository {
  insertEvidence(evidence: GrowthEvidence): Promise<void>;
  getEvidenceForStudent(studentId: string, opts?: { dimension?: GrowthDimension; since?: string }): Promise<GrowthEvidence[]>;

  insertSnapshot(snapshot: GrowthSnapshot): Promise<void>;
  getLatestSnapshot(studentId: string): Promise<GrowthSnapshot | null>;
  getSnapshotHistory(studentId: string, limit: number): Promise<GrowthSnapshot[]>;

  upsertMilestones(milestones: GrowthMilestone[]): Promise<GrowthMilestone[]>; // returns newly-inserted ones only
  getMilestones(studentId: string): Promise<GrowthMilestone[]>;

  insertInsights(insights: GrowthInsight[]): Promise<void>;
  getRecentInsights(studentId: string, limit: number): Promise<GrowthInsight[]>;

  /** True if `instructorId` is authorized to view `studentId`'s growth
   * data (e.g. via an enrollment/roster relationship). Server-side only —
   * never trust a client-supplied boolean for this. */
  isAuthorizedInstructor(instructorId: string, studentId: string): Promise<boolean>;
}
