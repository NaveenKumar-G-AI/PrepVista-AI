import type { CorrectnessAssessment, SubmissionRef } from "../domain/types.js";

/**
 * Persistence port. `supabaseRepository.ts` is the real implementation;
 * tests use an in-memory implementation (test/fixtures/memoryRepository.ts)
 * so the API/security layers can be unit-tested without a live database.
 *
 * IMPLEMENTATIONS MUST NEVER TRUST A CALLER-SUPPLIED userId FOR WRITES —
 * see src/security/authorization.ts. `save()` takes a full
 * CorrectnessAssessment whose ref.userId was derived server-side.
 */
export interface CorrectnessRepository {
  /** Upsert keyed on (submissionId, submissionVersion) — the idempotency contract. */
  save(assessment: CorrectnessAssessment): Promise<CorrectnessAssessment>;

  /** Fetch the assessment for one exact submission version, or null. */
  getByVersion(ref: Pick<SubmissionRef, "submissionId" | "submissionVersion">): Promise<CorrectnessAssessment | null>;

  /** Most recent assessment for this problem+user, excluding the given version (used to compute delta), or null. */
  getPreviousForUser(
    problemId: string,
    userId: string,
    excludingSubmissionVersion: string
  ): Promise<CorrectnessAssessment | null>;

  /** Full correctness timeline for a problem+user, newest first. */
  getHistory(problemId: string, userId: string, limit?: number): Promise<CorrectnessAssessment[]>;
}
