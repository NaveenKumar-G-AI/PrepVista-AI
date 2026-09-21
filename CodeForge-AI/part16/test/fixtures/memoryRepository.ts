import type { CorrectnessRepository } from "../../src/persistence/repository.js";
import type { CorrectnessAssessment, SubmissionRef } from "../../src/domain/types.js";

/**
 * In-memory stand-in for SupabaseCorrectnessRepository, used by unit tests
 * (security, concurrency, idempotency, API handlers) so those layers can
 * be tested without a live database connection. Mirrors the real
 * repository's idempotency contract: save() upserts on
 * (submissionId, submissionVersion).
 */
export class InMemoryCorrectnessRepository implements CorrectnessRepository {
  private byKey = new Map<string, CorrectnessAssessment>();
  public saveCallCount = 0;

  private key(submissionId: string, submissionVersion: string) {
    return `${submissionId}::${submissionVersion}`;
  }

  async save(assessment: CorrectnessAssessment): Promise<CorrectnessAssessment> {
    this.saveCallCount += 1;
    this.byKey.set(this.key(assessment.ref.submissionId, assessment.ref.submissionVersion), assessment);
    return assessment;
  }

  async getByVersion(
    ref: Pick<SubmissionRef, "submissionId" | "submissionVersion">
  ): Promise<CorrectnessAssessment | null> {
    return this.byKey.get(this.key(ref.submissionId, ref.submissionVersion)) ?? null;
  }

  async getPreviousForUser(
    problemId: string,
    userId: string,
    excludingSubmissionVersion: string
  ): Promise<CorrectnessAssessment | null> {
    const matches = [...this.byKey.values()]
      .filter(
        (a) =>
          a.ref.problemId === problemId &&
          a.ref.userId === userId &&
          a.ref.submissionVersion !== excludingSubmissionVersion
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0] ?? null;
  }

  async getHistory(problemId: string, userId: string, limit = 20): Promise<CorrectnessAssessment[]> {
    return [...this.byKey.values()]
      .filter((a) => a.ref.problemId === problemId && a.ref.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /** Test-only helper to inspect raw stored state. */
  size(): number {
    return this.byKey.size;
  }
}
