// ============================================================================
// Phase 43 — post-completion structured summary. "Every factual statement
// must come from actual evidence." Every field here is derived directly from
// the session's own coverage/evaluations — nothing is invented to fill a
// field the evidence doesn't support; those fields fall back to
// INSUFFICIENT_EVIDENCE / NOT_APPLICABLE instead.
// ============================================================================

import type { BlueprintSkillTarget, CompletionRequirements, Evaluation, InterviewMode, InterviewSession, InterviewSummary } from "../domain/types.js";
import { buildCoverageReport, checkCompletion } from "./coverage.js";

export function buildInterviewSummary(
  session: InterviewSession,
  skills: BlueprintSkillTarget[],
  completionRequirements: CompletionRequirements,
  evaluations: Evaluation[],
): InterviewSummary {
  const report = buildCoverageReport(skills, session.coverage);
  const totalQuestions = session.questionIds.length;
  const completion = checkCompletion(skills, session.coverage, completionRequirements, totalQuestions);

  const okEvaluations = evaluations.filter((e) => e.status === "OK");

  const technicalStrengths = report.sufficientSkillIds.filter((skillId) =>
    okEvaluations.some((e) => e.skillId === skillId && e.adaptiveSignal === "STRONG"),
  );

  const contradictionSkillIds = [...new Set(okEvaluations.filter((e) => e.consistency === "POTENTIAL_INCONSISTENCY").map((e) => e.skillId))];
  const uncertainSkillIds = [...new Set([...report.uncertainSkillIds, ...contradictionSkillIds])];

  return {
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    technicalStrengths,
    verifiedSkills: report.sufficientSkillIds,
    partiallyVerifiedSkills: report.partialSkillIds,
    technicalGaps: report.notAssessedSkillIds,
    uncertainSkills: uncertainSkillIds,
    reasoningStrength: aggregateReasoningStrength(okEvaluations),
    debuggingStrength: session.mode === "DEBUGGING_INTERVIEW" ? aggregateReasoningStrength(okEvaluations) : "NOT_APPLICABLE",
    projectUnderstanding: aggregateProjectUnderstanding(session.mode, okEvaluations),
    technicalCommunication: aggregateCommunication(okEvaluations),
    additionalVerificationRequired: uncertainSkillIds,
    assessmentComplete: completion.isComplete,
  };
}

function aggregateReasoningStrength(evaluations: Evaluation[]): InterviewSummary["reasoningStrength"] {
  const values = evaluations
    .map((e) => e.dimensions.reasoningQuality)
    .filter((v): v is "STRONG" | "ADEQUATE" | "WEAK" => v === "STRONG" || v === "ADEQUATE" || v === "WEAK");
  if (values.length === 0) return "INSUFFICIENT_EVIDENCE";
  return pickModalTier(values, ["STRONG", "ADEQUATE", "WEAK"]);
}

function aggregateProjectUnderstanding(mode: InterviewMode, evaluations: Evaluation[]): InterviewSummary["projectUnderstanding"] {
  if (mode !== "PROJECT_DEFENSE" && mode !== "CODE_DEFENSE") return "NOT_APPLICABLE";
  const values = evaluations
    .map((e) => e.dimensions.understanding)
    .filter((v): v is "DEMONSTRATED" | "PARTIAL" | "NOT_DEMONSTRATED" => v === "DEMONSTRATED" || v === "PARTIAL" || v === "NOT_DEMONSTRATED");
  if (values.length === 0) return "INSUFFICIENT_EVIDENCE";
  const mapped: Array<"STRONG" | "ADEQUATE" | "WEAK"> = values.map((v) => (v === "DEMONSTRATED" ? "STRONG" : v === "PARTIAL" ? "ADEQUATE" : "WEAK"));
  return pickModalTier(mapped, ["STRONG", "ADEQUATE", "WEAK"]);
}

function aggregateCommunication(evaluations: Evaluation[]): InterviewSummary["technicalCommunication"] {
  const values = evaluations
    .map((e) => e.dimensions.communicationClarity)
    .filter((v): v is "CLEAR" | "ADEQUATE" | "UNCLEAR" => v === "CLEAR" || v === "ADEQUATE" || v === "UNCLEAR");
  if (values.length === 0) return "INSUFFICIENT_EVIDENCE";
  return pickModalTier(values, ["CLEAR", "ADEQUATE", "UNCLEAR"]);
}

/** Picks the most frequent tier, breaking ties toward the stronger tier (earlier in `order`) — never toward the weaker one. */
function pickModalTier<T extends string>(values: T[], order: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = order[order.length - 1] as T;
  let bestCount = -1;
  for (const tier of order) {
    const count = counts.get(tier) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = tier;
    }
  }
  return best;
}
