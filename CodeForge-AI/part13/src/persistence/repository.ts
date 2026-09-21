import type { FinalizedExecutionResult } from "../types/normalized.js";

export interface AuthContext {
  userId: string;
  role: "STUDENT" | "INSTRUCTOR" | "INTERVIEWER" | "ADMINISTRATOR" | "INTERNAL_EVALUATOR";
  /** Cohort ids the caller is authorized for, when role is INSTRUCTOR/INTERVIEWER. Ignored for ADMIN/INTERNAL_EVALUATOR. */
  authorizedCohortIds?: string[];
}

export class ResultNotFoundError extends Error {
  constructor(evaluationId: string) {
    super(`No finalized result exists for evaluation ${evaluationId}`);
    this.name = "ResultNotFoundError";
  }
}

export class UnauthorizedResultAccessError extends Error {
  constructor() {
    super("Caller is not authorized to access this result.");
    this.name = "UnauthorizedResultAccessError";
  }
}

export class DuplicateFinalizationError extends Error {
  constructor(evaluationId: string) {
    super(`Evaluation ${evaluationId} is already finalized; this insert was rejected to preserve immutability.`);
    this.name = "DuplicateFinalizationError";
  }
}

/**
 * Storage-agnostic contract for persisting/reading finalized execution
 * results. Authorization MUST be derived server-side from AuthContext —
 * callers must never pass a trusted "ownerId" from client input (this is
 * the IDOR-protection boundary).
 */
export interface ExecutionResultRepository {
  /**
   * Idempotent insert. If a result already exists for this evaluationId,
   * implementations MUST reject the write (throw DuplicateFinalizationError)
   * rather than overwrite it — this is the immutability guarantee enforced
   * at the persistence boundary, in addition to the DB trigger in the SQL
   * migration for real Postgres deployments.
   */
  insertFinalizedResult(result: FinalizedExecutionResult, ownerUserId: string, cohortId: string | null): Promise<void>;

  /** Authorization is derived entirely from `ctx`, never from client-supplied ownership claims. */
  getResultForSubmission(
    submissionId: string,
    ctx: AuthContext,
  ): Promise<{ result: FinalizedExecutionResult; ownerUserId: string; cohortId: string | null }>;

  getResultByEvaluationId(
    evaluationId: string,
    ctx: AuthContext,
  ): Promise<{ result: FinalizedExecutionResult; ownerUserId: string; cohortId: string | null }>;
}

interface StoredRow {
  result: FinalizedExecutionResult;
  ownerUserId: string;
  cohortId: string | null;
}

/**
 * In-memory reference implementation. Used by the test suite and as a
 * behavioral spec for any real (Supabase/Postgres) implementation — a
 * production adapter should satisfy the exact same authorization and
 * idempotency behavior exercised in tests/repository.test.ts.
 */
export class InMemoryExecutionResultRepository implements ExecutionResultRepository {
  private byEvaluationId = new Map<string, StoredRow>();
  private bySubmissionId = new Map<string, string>(); // submissionId -> evaluationId (latest finalized)

  async insertFinalizedResult(
    result: FinalizedExecutionResult,
    ownerUserId: string,
    cohortId: string | null,
  ): Promise<void> {
    if (this.byEvaluationId.has(result.evaluationId)) {
      throw new DuplicateFinalizationError(result.evaluationId);
    }
    this.byEvaluationId.set(result.evaluationId, { result, ownerUserId, cohortId });
    this.bySubmissionId.set(result.submissionId, result.evaluationId);
  }

  async getResultForSubmission(submissionId: string, ctx: AuthContext) {
    const evaluationId = this.bySubmissionId.get(submissionId);
    if (!evaluationId) throw new ResultNotFoundError(submissionId);
    return this.getResultByEvaluationId(evaluationId, ctx);
  }

  async getResultByEvaluationId(evaluationId: string, ctx: AuthContext) {
    const row = this.byEvaluationId.get(evaluationId);
    if (!row) throw new ResultNotFoundError(evaluationId);

    if (!this.isAuthorized(row, ctx)) {
      throw new UnauthorizedResultAccessError();
    }
    return row;
  }

  private isAuthorized(row: StoredRow, ctx: AuthContext): boolean {
    if (ctx.role === "ADMINISTRATOR" || ctx.role === "INTERNAL_EVALUATOR") return true;
    if (ctx.role === "STUDENT") return row.ownerUserId === ctx.userId;
    // INSTRUCTOR / INTERVIEWER — must be authorized for the result's cohort.
    if (row.cohortId === null) return false;
    return (ctx.authorizedCohortIds ?? []).includes(row.cohortId);
  }
}

/**
 * Supabase-backed adapter skeleton. NOT wired to a live project — the
 * project URL/keys are intentionally left blank for you to fill in from
 * your actual environment. Row-level security (rls_policies.sql) is the
 * primary authorization boundary when using the anon/user JWT client;
 * this adapter additionally checks ownership defensively so a misconfigured
 * policy fails closed rather than open.
 */
export class SupabaseExecutionResultRepository implements ExecutionResultRepository {
  constructor(
    private readonly supabaseUrl: string = process.env.SUPABASE_URL ?? "",
    private readonly supabaseServiceRoleKey: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ) {}

  private assertConfigured(): void {
    if (!this.supabaseUrl || !this.supabaseServiceRoleKey) {
      throw new Error(
        "SupabaseExecutionResultRepository is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
          "(left blank intentionally in this scaffold) before use.",
      );
    }
  }

  async insertFinalizedResult(): Promise<void> {
    this.assertConfigured();
    throw new Error(
      "SupabaseExecutionResultRepository.insertFinalizedResult is a scaffold. Wire it to your @supabase/supabase-js " +
        "service-role client using the schema in migrations/0001_execution_results.sql — insert into " +
        "execution_results with ON CONFLICT (evaluation_id) DO NOTHING and check rowCount === 1 to preserve the " +
        "idempotent-insert contract before enabling this in production.",
    );
  }

  async getResultForSubmission(): Promise<never> {
    this.assertConfigured();
    throw new Error(
      "SupabaseExecutionResultRepository.getResultForSubmission is a scaffold. Wire it to a Supabase client scoped " +
        "to the caller's JWT so RLS (see rls_policies.sql) enforces authorization at the database layer; do not " +
        "use the service-role key for read paths that serve end users.",
    );
  }

  async getResultByEvaluationId(): Promise<never> {
    this.assertConfigured();
    throw new Error("SupabaseExecutionResultRepository.getResultByEvaluationId is a scaffold. See notes above.");
  }
}
