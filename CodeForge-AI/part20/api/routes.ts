// Illustrative Next.js App Router-style handlers. If your API layer isn't
// Next.js, port the BODY of each handler into your framework's equivalent —
// the sequence of calls is what matters, not the framework.
//
// Every `deps.*` function here is a TODO seam: wire it to your real
// auth/session, database, and reasoning-extraction systems. Nothing in this
// file talks to a real database or session store.

import { runConsistencyAnalysis } from "../src/engine/consistencyEngine";
import { applyReconciliationAnswer } from "../src/engine/reconciliation";
import type { EvidenceAdapters } from "../src/evidence/adapters";
import { getConfiguredAIProvider } from "../src/ai/providers";
import { assertOwnsSubmission, ForbiddenError } from "../src/security";
import type { ConsistencyDimension, DimensionResult, Finding, RawReasoningClaim } from "../src/types";

export interface RouteDeps {
  adapters: EvidenceAdapters;
  /** TODO: replace with your real session/auth lookup (e.g. Supabase auth.getUser()). */
  getCurrentUserId: (req: Request) => Promise<string>;
  /** TODO: real DB lookup. */
  getSubmissionOwnerId: (submissionId: string) => Promise<string>;
  /** TODO: real DB lookup. */
  getProblemIdForSubmission: (submissionId: string) => Promise<string>;
  /** TODO: persist to consistency_analysis / consistency_finding / consistency_relationship. */
  persistAnalysis: (result: Awaited<ReturnType<typeof runConsistencyAnalysis>>) => Promise<{ id: string }>;
}

export function createAnalyzeHandler(deps: RouteDeps) {
  return async function POST(req: Request): Promise<Response> {
    try {
      const userId = await deps.getCurrentUserId(req);
      const { submissionId } = (await req.json()) as { submissionId: string };
      if (!submissionId) return Response.json({ error: "submissionId is required" }, { status: 400 });

      const ownerId = await deps.getSubmissionOwnerId(submissionId);
      assertOwnsSubmission({ requestingUserId: userId, submissionOwnerId: ownerId });

      const problemId = await deps.getProblemIdForSubmission(submissionId);
      const aiProvider = getConfiguredAIProvider();
      const result = await runConsistencyAnalysis({ submissionId, problemId, adapters: deps.adapters, aiProvider });
      const persisted = await deps.persistAnalysis(result);

      return Response.json({ analysisId: persisted.id, ...result }, { status: 200 });
    } catch (err) {
      if (err instanceof ForbiddenError) return Response.json({ error: err.message }, { status: 403 });
      console.error("consistency analyze failed", err);
      return Response.json({ error: "Analysis failed" }, { status: 500 });
    }
  };
}

export interface ReconcileDeps extends RouteDeps {
  /** TODO: real DB lookup for a single finding. */
  getFinding: (findingId: string) => Promise<Finding | null>;
  /** TODO: run the student's answer text through your existing reasoning-claim extraction. */
  extractClaimsFromAnswer: (answerText: string) => Promise<RawReasoningClaim[]>;
  /** TODO: re-run just the one relevant dimension comparator with the new claims folded in. */
  rerunDimension: (dimension: ConsistencyDimension, newClaims: RawReasoningClaim[]) => Promise<DimensionResult>;
  /** TODO: persist the updated finding + dimension result + a reconciliation_response row. */
  persistReconciliation: (update: { finding: Finding; dimensionResult: DimensionResult }) => Promise<void>;
}

export function createReconcileHandler(deps: ReconcileDeps) {
  return async function POST(req: Request): Promise<Response> {
    try {
      const userId = await deps.getCurrentUserId(req);
      const { findingId, submissionId, studentAnswerText } = (await req.json()) as {
        findingId: string;
        submissionId: string;
        studentAnswerText: string;
      };

      const ownerId = await deps.getSubmissionOwnerId(submissionId);
      assertOwnsSubmission({ requestingUserId: userId, submissionOwnerId: ownerId });

      const finding = await deps.getFinding(findingId);
      if (!finding) return Response.json({ error: "Finding not found" }, { status: 404 });

      const newClaims = await deps.extractClaimsFromAnswer(studentAnswerText);
      const updatedDimensionResult = await deps.rerunDimension(finding.dimension, newClaims);
      const { updatedFinding } = await applyReconciliationAnswer({
        finding,
        studentAnswerText,
        newClaims,
        recomparator: () => updatedDimensionResult,
      });
      await deps.persistReconciliation({ finding: updatedFinding, dimensionResult: updatedDimensionResult });

      return Response.json({ finding: updatedFinding, dimensionResult: updatedDimensionResult }, { status: 200 });
    } catch (err) {
      if (err instanceof ForbiddenError) return Response.json({ error: err.message }, { status: 403 });
      console.error("reconciliation failed", err);
      return Response.json({ error: "Reconciliation failed" }, { status: 500 });
    }
  };
}
