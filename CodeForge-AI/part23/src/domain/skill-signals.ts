// ============================================================================
// Debugging skill signals (Section 32)
// ============================================================================
// Deterministic aggregation from session state into the structured signal
// set a future Skill Signal Engine would consume. This module produces
// clean data only — Section 32: "Do not implement the future Skill Signal
// Engine itself. Expose clean data for it."
// ============================================================================

import { DebuggingCoachState, DebuggingSkillSignals, HypothesisStatus, clamp01 } from "../types.js";
import { wasGoodFaithRejection } from "./hypothesis-engine.js";
import { detectTrialAndError } from "./coaching-progression.js";

export function computeSkillSignals(state: DebuggingCoachState): DebuggingSkillSignals {
  return {
    hypothesisQuality: hypothesisQualitySignal(state),
    evidenceUsage: evidenceUsageSignal(state),
    problemLocalization: problemLocalizationSignal(state),
    experimentQuality: experimentQualitySignal(state),
    rootCauseReasoning: rootCauseReasoningSignal(state),
    fixReasoning: fixReasoningSignal(state),
    regressionAwareness: regressionAwarenessSignal(state),
    debuggingEfficiency: debuggingEfficiencySignal(state),
  };
}

function hypothesisQualitySignal(state: DebuggingCoachState): number {
  if (state.hypotheses.length === 0) return 0.5; // neutral prior — not yet observed, not penalized
  const scores = state.hypotheses.map((h) => {
    const base = h.quality?.overall ?? 0.4;
    // Section 11: a well-formed hypothesis correctly rejected through real
    // testing is good debugging behavior, not a mistake.
    return wasGoodFaithRejection(h) ? Math.max(base, 0.6) : base;
  });
  return clamp01(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function evidenceUsageSignal(state: DebuggingCoachState): number {
  if (state.actionLog.length === 0) return 0.5;
  const evidenceDriven = state.actionLog.filter((a) =>
    (["CREATE_HYPOTHESIS", "UPDATE_HYPOTHESIS", "RESPOND_TO_COACH"] as string[]).includes(a.type)
  ).length;
  const blindEdits = state.actionLog.filter((a) => a.type === "EDIT_CODE").length;
  if (evidenceDriven + blindEdits === 0) return 0.5;
  return clamp01(evidenceDriven / (evidenceDriven + blindEdits));
}

function problemLocalizationSignal(state: DebuggingCoachState): number {
  if (!state.evidence.failure?.sourceLocation) return 0.3;
  const actionsSoFar = state.actionLog.length;
  if (actionsSoFar <= 6) return 1.0;
  if (actionsSoFar <= 12) return 0.7;
  return 0.45;
}

function experimentQualitySignal(state: DebuggingCoachState): number {
  if (state.experiments.length === 0) return 0.5;
  const interpreted = state.experiments.filter((e) => !!e.interpretation && e.actualObservation !== undefined).length;
  return clamp01(interpreted / state.experiments.length);
}

function rootCauseReasoningSignal(state: DebuggingCoachState): number {
  if (!state.knownRootCause) return 0.3;
  const grounded = state.hypotheses.some((h) => h.status === HypothesisStatus.SUPPORTED && !!h.resolutionEvidence);
  return grounded ? 0.9 : 0.55;
}

function fixReasoningSignal(state: DebuggingCoachState): number {
  if (!state.fixState.proposed) return 0.3;
  return state.fixState.alignsWithRootCause ? 0.9 : 0.5;
}

function regressionAwarenessSignal(state: DebuggingCoachState): number {
  if (!state.fixState.appliedAt) return 0.4;
  if (!state.regressionState.lastRunAt) return 0.15; // fix applied, regression never checked
  return state.regressionState.passed ? 0.95 : 0.6;
}

function debuggingEfficiencySignal(state: DebuggingCoachState): number {
  let score = 1.0;
  if (detectTrialAndError(state.actionLog).detected) score -= 0.35;
  const heavyEscalations = state.recommendationHistory.filter(
    (r) => r.coachingLevel !== "OBSERVATION" && r.coachingLevel !== "QUESTION"
  ).length;
  score -= Math.min(0.4, heavyEscalations * 0.08);
  return clamp01(score);
}
