import type { AIGatewayPort } from "../integration/ports.js";
import type { EvidenceArtifactRef, InterviewQuestion, ConfidenceBand } from "../domain/types.js";

export type EvaluationResult =
  | { ok: true; value: Awaited<ReturnType<AIGatewayPort["evaluateResponse"]>> }
  | { ok: false; error: string };

/**
 * §42 — the full pipeline: response + question context + role/skill context
 * + evidence context -> AI evaluation -> grounding check -> structured
 * result. §45 — a thrown/rejected AI call becomes an explicit `ok:false`
 * result, never a fabricated evaluation and never an automatic failing
 * grade for the candidate. The caller (interviewOrchestrator) decides what
 * EVALUATION_PENDING/EVALUATION_FAILED handling looks like.
 */
export async function runEvaluationPipeline(params: {
  aiGateway: AIGatewayPort;
  orgId: string;
  role: string;
  question: InterviewQuestion;
  responseText: string;
  evidence?: EvidenceArtifactRef;
  dimensions: string[];
}): Promise<EvaluationResult> {
  try {
    const raw = await params.aiGateway.evaluateResponse({
      orgId: params.orgId,
      role: params.role,
      skill: params.question.skill,
      questionText: params.question.promptText,
      questionType: params.question.questionType,
      responseText: params.responseText,
      evidence: params.evidence
        ? { sourceType: params.evidence.sourceType, artifactId: params.evidence.artifactId, content: params.evidence.content }
        : undefined,
      dimensions: params.dimensions,
    });

    // §44 grounding enforcement is a code rule, not a trust exercise: if the
    // model itself couldn't confirm it stayed inside the supplied context,
    // we cap how confident the resulting evidence is allowed to claim to be
    // — we don't just take "grounded: true" on faith either.
    const evidenceConfidence: ConfidenceBand = raw.grounded ? raw.evidenceConfidence : capAtLow(raw.evidenceConfidence);

    return { ok: true, value: { ...raw, evidenceConfidence } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function capAtLow(band: ConfidenceBand): ConfidenceBand {
  return band === "HIGH" ? "MODERATE" : band === "MODERATE" ? "LOW" : "LOW";
}
