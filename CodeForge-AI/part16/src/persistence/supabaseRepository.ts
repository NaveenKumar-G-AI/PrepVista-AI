import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectnessRepository } from "./repository.js";
import type { CorrectnessAssessment, SubmissionRef } from "../domain/types.js";

/**
 * Real @supabase/supabase-js implementation. Construct this with a client
 * created from the server's SERVICE ROLE key (never the anon/public key) —
 * writes must bypass RLS because the server is the authority deriving
 * user_id/status, not a value the client can set. Reads made through this
 * class also bypass RLS by design (the service role always does), which is
 * why every read method here takes an explicit, server-verified `userId`
 * and filters by it in the query itself — this class does NOT rely on RLS
 * to enforce isolation; see src/security/authorization.ts for the
 * complementary application-layer check used by the API handlers before
 * this repository is even called with a user's request.
 */
export class SupabaseCorrectnessRepository implements CorrectnessRepository {
  constructor(private readonly client: SupabaseClient) {}

  async save(assessment: CorrectnessAssessment): Promise<CorrectnessAssessment> {
    const row = toRow(assessment);
    const { data, error } = await this.client
      .from("correctness_assessments")
      .upsert(row, { onConflict: "submission_id,submission_version" })
      .select()
      .single();

    if (error) throw new Error(`SupabaseCorrectnessRepository.save failed: ${error.message}`);

    await this.replaceFindings(data.id as string, assessment);
    await this.replaceRequirementChecks(data.id as string, assessment);

    return assessment;
  }

  async getByVersion(
    ref: Pick<SubmissionRef, "submissionId" | "submissionVersion">
  ): Promise<CorrectnessAssessment | null> {
    const { data, error } = await this.client
      .from("correctness_assessments")
      .select("raw")
      .eq("submission_id", ref.submissionId)
      .eq("submission_version", ref.submissionVersion)
      .maybeSingle();

    if (error) throw new Error(`SupabaseCorrectnessRepository.getByVersion failed: ${error.message}`);
    return data ? (data.raw as CorrectnessAssessment) : null;
  }

  async getPreviousForUser(
    problemId: string,
    userId: string,
    excludingSubmissionVersion: string
  ): Promise<CorrectnessAssessment | null> {
    const { data, error } = await this.client
      .from("correctness_assessments")
      .select("raw")
      .eq("problem_id", problemId)
      .eq("user_id", userId) // server-verified id, not client input — see class doc comment
      .neq("submission_version", excludingSubmissionVersion)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`SupabaseCorrectnessRepository.getPreviousForUser failed: ${error.message}`);
    return data ? (data.raw as CorrectnessAssessment) : null;
  }

  async getHistory(problemId: string, userId: string, limit = 20): Promise<CorrectnessAssessment[]> {
    const { data, error } = await this.client
      .from("correctness_assessments")
      .select("raw")
      .eq("problem_id", problemId)
      .eq("user_id", userId) // server-verified id, not client input
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`SupabaseCorrectnessRepository.getHistory failed: ${error.message}`);
    return (data ?? []).map((r) => r.raw as CorrectnessAssessment);
  }

  private async replaceFindings(assessmentId: string, assessment: CorrectnessAssessment): Promise<void> {
    await this.client.from("correctness_findings").delete().eq("assessment_id", assessmentId);
    const rows = [
      ...assessment.staticFindings.map((f) => ({
        assessment_id: assessmentId,
        user_id: assessment.ref.userId,
        kind: "static" as const,
        rule_or_claim: f.ruleId,
        severity_or_confidence: f.severity,
        message: f.message,
        evidence_ids: [],
        source_range: f.range ?? null,
      })),
      ...assessment.deterministic.clusters.map((c) => ({
        assessment_id: assessmentId,
        user_id: assessment.ref.userId,
        kind: "cluster" as const,
        rule_or_claim: c.id,
        severity_or_confidence: null,
        message: c.hypothesis,
        evidence_ids: c.testIds,
        source_range: null,
      })),
      ...(assessment.ai.result?.findings ?? []).map((f) => ({
        assessment_id: assessmentId,
        user_id: assessment.ref.userId,
        kind: "ai_finding" as const,
        rule_or_claim: f.claim,
        severity_or_confidence: f.confidence,
        message: f.claim,
        evidence_ids: f.evidenceIds,
        source_range: null,
      })),
    ];
    if (rows.length > 0) {
      const { error } = await this.client.from("correctness_findings").insert(rows);
      if (error) throw new Error(`SupabaseCorrectnessRepository.replaceFindings failed: ${error.message}`);
    }
  }

  private async replaceRequirementChecks(assessmentId: string, assessment: CorrectnessAssessment): Promise<void> {
    await this.client.from("requirement_checks").delete().eq("assessment_id", assessmentId);
    const rows = assessment.requirementCoverage.map((rc) => ({
      assessment_id: assessmentId,
      user_id: assessment.ref.userId,
      requirement_id: rc.requirement.id,
      description: rc.requirement.description,
      category: rc.requirement.category,
      status: rc.status,
      rationale: rc.rationale,
      supporting_evidence_ids: rc.supportingEvidenceIds,
    }));
    if (rows.length > 0) {
      const { error } = await this.client.from("requirement_checks").insert(rows);
      if (error) throw new Error(`SupabaseCorrectnessRepository.replaceRequirementChecks failed: ${error.message}`);
    }
  }
}

function toRow(a: CorrectnessAssessment) {
  return {
    submission_id: a.ref.submissionId,
    submission_version: a.ref.submissionVersion,
    problem_id: a.ref.problemId,
    user_id: a.ref.userId,
    language: a.ref.language,
    status: a.status,
    confidence: a.confidence,
    error_category: a.deterministic.errorCategory,
    pass_rate: a.deterministic.passRateAvailable,
    total_available: a.deterministic.totalAvailable,
    passed: a.deterministic.passed,
    failed: a.deterministic.failed,
    skipped: a.deterministic.skipped,
    summary: a.deterministic.summary,
    ai_available: a.ai.available,
    ai_degradation_reason: a.ai.degradationReason,
    ai_provider: a.ai.provider ?? null,
    ai_model: a.ai.model ?? null,
    ai_latency_ms: a.ai.latencyMs ?? null,
    ai_disagreed: a.ai.disagreedWithDeterministic,
    delta: a.delta,
    raw: a,
    created_at: a.createdAt,
  };
}
