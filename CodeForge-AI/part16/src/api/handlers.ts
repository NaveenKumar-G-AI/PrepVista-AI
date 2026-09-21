import type { CorrectnessAssessment, ExecutionEvidence, Requirement } from "../domain/types.js";
import type { CorrectnessRepository } from "../persistence/repository.js";
import type { AIProvider } from "../ai/provider.js";
import { assertOwnsSubmission, AuthorizationError, type SubmissionOwnershipLookup } from "../security/authorization.js";
import type { RateLimiter } from "../security/rateLimiter.js";
import { assembleCorrectnessAssessment } from "../index.js";
import type { Logger } from "../observability/logger.js";
import type { Metrics } from "../observability/metrics.js";
import { noopMetrics } from "../observability/metrics.js";
import { consoleLogger } from "../observability/logger.js";

export class RateLimitedError extends Error {
  constructor() {
    super("Rate limit exceeded — please slow down.");
    this.name = "RateLimitedError";
  }
}
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Adapters onto CodeForge's EXISTING execution engine / submission store /
 * problem-spec store. This module deliberately does not implement any of
 * these — it consumes them, per the spec's "extend, don't duplicate"
 * instruction. Wire real implementations backed by the actual tables in
 * exampleExpressRoutes.ts (or your framework's equivalent).
 */
export interface HandlerDeps {
  repo: CorrectnessRepository;
  ownership: SubmissionOwnershipLookup;
  executionEvidence: {
    /** Most recent execution evidence for this submission. */
    getExecutionEvidence(submissionId: string): Promise<ExecutionEvidence | null>;
    /**
     * Evidence for one EXACT prior version, used only for delta/regression
     * comparison. Reuses the host app's existing execution-result storage
     * (it already has this — that's what an execution result IS) rather
     * than this engine duplicating a second copy of it.
     */
    getExecutionEvidenceByVersion(
      submissionId: string,
      submissionVersion: string
    ): Promise<ExecutionEvidence | null>;
  };
  submissionSource: {
    getSourceCode(submissionId: string): Promise<{ sourceCode: string; filename: string } | null>;
  };
  requirements: { getRequirements(problemId: string): Promise<Requirement[]> };
  rateLimiter: RateLimiter;
  aiProvider: AIProvider | null;
  logger?: Logger;
  metrics?: Metrics;
}

/**
 * Runs (or re-runs) correctness analysis for one submission and persists
 * the result. This is the only handler that WRITES. Authorization,
 * idempotency (via the repository's upsert-on-version contract), and rate
 * limiting are all enforced here, in this order, before any real work
 * happens.
 */
export async function requestAnalysis(
  deps: HandlerDeps,
  requesterUserId: string,
  submissionId: string
): Promise<CorrectnessAssessment> {
  await assertOwnsSubmission(deps.ownership, submissionId, requesterUserId);

  const allowed = await deps.rateLimiter.tryConsume(`analysis:${requesterUserId}`);
  if (!allowed) throw new RateLimitedError();

  const evidence = await deps.executionEvidence.getExecutionEvidence(submissionId);
  if (!evidence) throw new NotFoundError("No execution evidence for this submission yet");

  // Defense in depth: even though `assertOwnsSubmission` already verified
  // ownership via the host app's submission table, also refuse to proceed
  // if the evidence we loaded doesn't match the requester — protects
  // against a future adapter bug that returns the wrong evidence object.
  if (evidence.ref.userId !== requesterUserId) throw new AuthorizationError();

  const source = await deps.submissionSource.getSourceCode(submissionId);
  if (!source) throw new NotFoundError("No source code found for this submission");

  const requirements = await deps.requirements.getRequirements(evidence.ref.problemId);

  // Idempotency: if this exact submission VERSION was already analyzed,
  // return the existing assessment instead of doing (and possibly
  // diverging on) the work again.
  const existing = await deps.repo.getByVersion({
    submissionId: evidence.ref.submissionId,
    submissionVersion: evidence.ref.submissionVersion,
  });
  if (existing) return existing;

  const previousAssessment = await deps.repo.getPreviousForUser(
    evidence.ref.problemId,
    requesterUserId,
    evidence.ref.submissionVersion
  );
  let previous: { verdict: CorrectnessAssessment["deterministic"]; evidence: ExecutionEvidence } | null = null;
  if (previousAssessment) {
    // Fetch the PREVIOUS submission's own evidence (not the current one!)
    // so computeDelta() compares real prior test-id outcomes against real
    // current ones. Getting this wrong (e.g. accidentally reusing the
    // current evidence object for both sides) silently zeroes out
    // newFailures/resolvedFailures — exactly the kind of bug the
    // regression detector exists to catch in student code, so it is
    // covered here by test/e2e/golden.e2e.test.ts.
    const previousEvidence = await deps.executionEvidence.getExecutionEvidenceByVersion(
      previousAssessment.ref.submissionId,
      previousAssessment.ref.submissionVersion
    );
    if (previousEvidence) {
      previous = { verdict: previousAssessment.deterministic, evidence: previousEvidence };
    }
  }

  const assessment = await assembleCorrectnessAssessment(
    { evidence, sourceCode: source.sourceCode, filename: source.filename, requirements, previous },
    {
      aiProvider: deps.aiProvider,
      logger: deps.logger ?? consoleLogger,
      metrics: deps.metrics ?? noopMetrics,
      correlationId: `req_${submissionId}_${evidence.ref.submissionVersion}`,
    }
  );

  return deps.repo.save(assessment);
}

/** Read-only: fetch the assessment for one exact submission version. */
export async function getCorrectnessAssessment(
  deps: Pick<HandlerDeps, "repo" | "ownership">,
  requesterUserId: string,
  submissionId: string,
  submissionVersion: string
): Promise<CorrectnessAssessment> {
  await assertOwnsSubmission(deps.ownership, submissionId, requesterUserId);
  const assessment = await deps.repo.getByVersion({ submissionId, submissionVersion });
  if (!assessment) throw new NotFoundError();
  return assessment;
}

/** Read-only: full correctness timeline for a problem, for the requester's own submissions only. */
export async function getCorrectnessHistory(
  deps: Pick<HandlerDeps, "repo">,
  requesterUserId: string,
  problemId: string,
  limit?: number
): Promise<CorrectnessAssessment[]> {
  // No ownership lookup needed here — history is scoped to the
  // requester's OWN userId directly, never a caller-supplied one.
  return deps.repo.getHistory(problemId, requesterUserId, limit);
}

/** Read-only: requirement coverage for one submission version (a view over the stored assessment). */
export async function getRequirementCoverage(
  deps: Pick<HandlerDeps, "repo" | "ownership">,
  requesterUserId: string,
  submissionId: string,
  submissionVersion: string
) {
  const assessment = await getCorrectnessAssessment(deps, requesterUserId, submissionId, submissionVersion);
  return assessment.requirementCoverage;
}

/** Read-only: compare two of the requester's OWN submission versions for the same problem. */
export async function compareSubmissionCorrectness(
  deps: Pick<HandlerDeps, "repo">,
  requesterUserId: string,
  submissionIdA: string,
  submissionVersionA: string,
  submissionIdB: string,
  submissionVersionB: string
) {
  const [a, b] = await Promise.all([
    deps.repo.getByVersion({ submissionId: submissionIdA, submissionVersion: submissionVersionA }),
    deps.repo.getByVersion({ submissionId: submissionIdB, submissionVersion: submissionVersionB }),
  ]);
  if (!a || !b) throw new NotFoundError();
  if (a.ref.userId !== requesterUserId || b.ref.userId !== requesterUserId) {
    // Same "don't leak existence" posture as assertOwnsSubmission.
    throw new NotFoundError();
  }
  return { a, b };
}
