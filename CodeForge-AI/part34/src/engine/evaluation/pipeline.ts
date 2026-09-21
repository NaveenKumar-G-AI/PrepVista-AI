// ============================================================================
// Phase 39 — the full evaluation pipeline:
//   Response -> Transcript -> Question Context -> Role Context -> Skill
//   Context -> Student Evidence Context -> Technical Evaluation ->
//   Reasoning Evaluation -> Consistency Evaluation -> Structured Skill
//   Evidence
//
// Phase 40 — AI must never directly modify mastery/readiness/gap/score.
// This function returns an Evaluation record; nothing in this file writes to
// any of the six downstream engines. That happens later, in
// evidenceExtraction.ts + the orchestration layer's integration fan-out.
//
// Phase 42 — AI failure never becomes student failure: every branch below
// that can fail returns a valid Evaluation with status EVALUATION_PENDING or
// EVALUATION_FAILED rather than throwing out of this function.
// ============================================================================

import {
  asEvaluationId,
  type EvaluationConfig,
  type Evaluation,
  type EvidenceReference,
  type Question,
  type Response,
  type RoleId,
  type StudentEvidenceContext,
} from "../../domain/types.js";
import type { AIGatewayPort, ReasoningVerificationPort, UnderstandingCheckPort } from "../../integration/ports.js";
import { AIGatewayError } from "../../integration/ports.js";
import { EVALUATION_PIPELINE_VERSION } from "../../config/versions.js";
import { buildGroundingContext } from "../grounding.js";
import { mapRawEvaluation } from "./mapRawEvaluation.js";
import { classifyConsistency, isEligibleForConsistencyCheck } from "./consistency.js";
import { deriveAdaptiveSignal } from "./adaptiveSignal.js";
import { computeConfidence } from "./confidence.js";
import type { ConfidenceFactors } from "../../domain/types.js";

const EVALUATION_VERSION = EVALUATION_PIPELINE_VERSION;

export interface EvaluationPipelineInput {
  question: Question;
  response: Response;
  roleId: RoleId;
  studentEvidence: StudentEvidenceContext;
  evaluationConfig: EvaluationConfig;
  /** How many prior evaluations already exist for this skill in this session, and at what confidence — feeds ConfidenceFactors. */
  priorQuestionCountForSkill: number;
  priorEvidenceConfidence: number; // 0-1, from the pre-interview snapshot
  followUpDepthForSkill: number; // normalized externally by caller (0-1) or raw count; see confidenceFactors mapping below
  maxFollowUpDepth: number;
}

export async function evaluateResponse(
  ports: { aiGateway: AIGatewayPort; reasoningVerification: ReasoningVerificationPort; understandingCheck: UnderstandingCheckPort },
  input: EvaluationPipelineInput,
): Promise<Evaluation> {
  const { question, response, evaluationConfig } = input;
  const now = new Date().toISOString();
  const grounding = buildGroundingContext(input.studentEvidence, question.skillId, question.groundedIn.length > 0);

  // ---- Step 1: AI technical evaluation (Phase 25-26) ------------------------
  let aiResult;
  try {
    aiResult = await ports.aiGateway.evaluateResponse({
      questionText: question.text,
      studentResponseText: response.content,
      skillId: question.skillId,
      roleId: input.roleId,
      evidenceSummaries: grounding.evidenceSummaries,
      codeExcerpt: grounding.codeExcerpt ? { language: grounding.codeExcerpt.language, content: grounding.codeExcerpt.content } : undefined,
      dimensionsRequested: evaluationConfig.dimensions,
    });
  } catch (err) {
    const failureReason = err instanceof AIGatewayError ? `${err.cause}: ${err.message}` : `Unexpected error: ${(err as Error).message}`;
    return buildPendingEvaluation(input, now, failureReason);
  }

  const mapped = mapRawEvaluation(aiResult, evaluationConfig.dimensions, grounding.evidenceSummaries, Boolean(grounding.codeExcerpt));

  if (mapped.groundingViolation) {
    // Phase 41: a response that cites evidence it was never given cannot be
    // trusted as-is. Rather than silently accept a hallucinated citation, we
    // return it as EVALUATION_PENDING so a human/regeneration path handles
    // it — this is treated exactly like an AI failure, not like a low score.
    return buildPendingEvaluation(
      input,
      now,
      `AI evaluation cited evidence not supplied: ${mapped.ungroundedCitations.join("; ")}`,
    );
  }

  // ---- Step 2: Reasoning verification (Phase 28), when requested -----------
  let reasoningSupplement: Awaited<ReturnType<ReasoningVerificationPort["verifyReasoning"]>> | null = null;
  if (evaluationConfig.dimensions.includes("reasoningQuality") && isEligibleForConsistencyCheck(response.content)) {
    reasoningSupplement = await ports.reasoningVerification.verifyReasoning({
      claim: question.text,
      studentResponse: response.content,
      supportingEvidence: grounding.evidenceSummaries.map(toEvidenceReference),
    });
  }

  // ---- Step 3: Understanding check (Phase 29), when requested ---------------
  let understandingSupplement: Awaited<ReturnType<UnderstandingCheckPort["checkUnderstanding"]>> | null = null;
  if (evaluationConfig.dimensions.includes("understanding") && isEligibleForConsistencyCheck(response.content)) {
    understandingSupplement = await ports.understandingCheck.checkUnderstanding({
      skillId: question.skillId,
      implementationEvidence: grounding.evidenceSummaries.map(toEvidenceReference),
      studentExplanation: response.content,
    });
  }

  const dimensions = { ...mapped.dimensions };
  if (reasoningSupplement && dimensions.reasoningQuality === "NOT_ASSESSED") {
    // Reconcile: if the AI didn't produce a usable value but the dedicated
    // reasoning service did, prefer the dedicated service's read — it's the
    // authoritative system for this dimension per Phase 28.
    dimensions.reasoningQuality = reasoningSupplement.logicalProgressionSound && reasoningSupplement.tradeoffsAddressed ? "STRONG" : reasoningSupplement.logicalProgressionSound ? "ADEQUATE" : "WEAK";
  }
  if (understandingSupplement) {
    // The dedicated Understanding Check is authoritative for this dimension
    // (Phase 29 exists specifically to distinguish implementation evidence
    // from understanding evidence — the AI eval alone can't do that split).
    dimensions.understanding = understandingSupplement.understandingDemonstrated;
  }

  // ---- Step 4: Consistency (Phase 14), only when code-grounded --------------
  let consistency: Evaluation["consistency"];
  if (evaluationConfig.requireConsistencyCheck && grounding.codeExcerpt) {
    consistency = isEligibleForConsistencyCheck(response.content)
      ? classifyConsistency({
          verifiedCodeFacts: input.studentEvidence.projectContext?.verifiedComponents ?? [],
          studentExplanation: response.content,
          aiFlaggedConsistency: mapped.consistency,
        })
      : "UNCERTAIN";
  }

  // ---- Step 5: Adaptive signal (Phase 21) ------------------------------------
  const adaptiveSignal = deriveAdaptiveSignal({ correctness: mapped.correctness, dimensions, consistency });

  // ---- Step 6: Confidence (Phase 24) -----------------------------------------
  const confidenceFactors: ConfidenceFactors = {
    responseQuality: estimateResponseQuality(response.content, mapped.correctness),
    questionDifficulty: question.difficulty / 5,
    questionCount: input.priorQuestionCountForSkill + 1,
    evidenceConsistency: consistency === "CONSISTENT" ? 1 : consistency === "PARTIALLY_CONSISTENT" ? 0.6 : consistency === "POTENTIAL_INCONSISTENCY" ? 0.2 : 0.5,
    projectCodeAlignment: grounding.codeExcerpt ? (consistency === "CONSISTENT" ? 1 : consistency === "POTENTIAL_INCONSISTENCY" ? 0.1 : 0.5) : null,
    priorEvidenceWeight: input.priorEvidenceConfidence,
    followUpDepth: input.maxFollowUpDepth > 0 ? input.followUpDepthForSkill / input.maxFollowUpDepth : 0,
  };
  const confidence = computeConfidence(confidenceFactors);

  return {
    id: asEvaluationId(`ev_${response.id}`),
    sessionId: question.sessionId,
    questionId: question.id,
    responseId: response.id,
    skillId: question.skillId,
    status: "OK",
    dimensions,
    consistency,
    adaptiveSignal,
    confidence,
    confidenceFactors,
    groundingRefs: grounding.evidenceSummaries.map(toEvidenceReference),
    evaluationVersion: EVALUATION_VERSION,
    evaluatedAt: now,
  };
}

function buildPendingEvaluation(input: EvaluationPipelineInput, now: string, failureReason: string): Evaluation {
  return {
    id: asEvaluationId(`ev_${input.response.id}`),
    sessionId: input.question.sessionId,
    questionId: input.question.id,
    responseId: input.response.id,
    skillId: input.question.skillId,
    status: "EVALUATION_PENDING",
    dimensions: {},
    adaptiveSignal: "UNCERTAIN",
    confidence: 0,
    confidenceFactors: {
      responseQuality: 0,
      questionDifficulty: input.question.difficulty / 5,
      questionCount: input.priorQuestionCountForSkill,
      evidenceConsistency: 0,
      projectCodeAlignment: null,
      priorEvidenceWeight: input.priorEvidenceConfidence,
      followUpDepth: 0,
    },
    groundingRefs: [],
    evaluationVersion: EVALUATION_VERSION,
    failureReason,
    evaluatedAt: now,
  };
}

function estimateResponseQuality(content: string, correctness: Evaluation["dimensions"]["technicalCorrectness"]): number {
  // NOTE: this feeds CONFIDENCE (how much we trust the evidence), not the
  // correctness verdict itself — a long, clear, INCORRECT answer still
  // yields high responseQuality (it was clearly a real, gradable attempt)
  // while an empty/INSUFFICIENT one yields low responseQuality regardless of
  // what correctness ends up being. This is what keeps confidence
  // independent of performance (Phase 24).
  const trimmed = content.trim();
  if (trimmed.length === 0 || correctness === "INSUFFICIENT") return 0.1;
  const wordCount = trimmed.split(/\s+/).length;
  return Math.max(0.2, Math.min(1, wordCount / 60));
}

function toEvidenceReference(summary: string): EvidenceReference {
  return {
    sourceType: "TECHNICAL_SKILL_SNAPSHOT",
    sourceId: summary as unknown as EvidenceReference["sourceId"],
    description: summary,
    capturedAt: new Date().toISOString(),
  };
}
