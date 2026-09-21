// ============================================================================
// Postmortem generation (Section 31)
// ============================================================================
// Deterministic assembly of the structured debugging summary. An AI layer
// may later be used to polish phrasing, but every fact here comes straight
// from state — never invented (Section 6: "Never fabricate missing data.").
// ============================================================================

import { DebuggingCoachState, DebuggingPostmortem, HypothesisStatus, nowIso } from "../types.js";
import { computeSkillSignals } from "./skill-signals.js";

export function generatePostmortem(state: DebuggingCoachState): DebuggingPostmortem {
  const supported = state.hypotheses.find((h) => h.status === HypothesisStatus.SUPPORTED);
  const rejected = state.hypotheses.filter((h) => h.status === HypothesisStatus.REJECTED);
  const successfulExperiment = state.experiments.find((e) => e.hypothesisId === supported?.id && !!e.interpretation);
  const signals = computeSkillSignals(state);

  return {
    failureSummary: summarizeFailure(state),
    rootCause: state.knownRootCause ?? "Not yet established.",
    evidence: collectEvidenceRefs(state),
    studentHypotheses: state.hypotheses.map((h) => ({ statement: h.statement, status: h.status })),
    successfulExperiment: successfulExperiment
      ? `${successfulExperiment.expectedObservation} → observed: ${successfulExperiment.actualObservation ?? "n/a"}. ${
          successfulExperiment.interpretation
        }`
      : undefined,
    rejectedHypotheses: rejected.map((h) => h.statement),
    fix: state.fixState.proposed ?? "Not yet proposed.",
    regressionResult: summarizeRegression(state),
    keyLearning: buildKeyLearning(state),
    recommendedPractice: buildRecommendedPractice(signals),
    skillSignals: signals,
    generatedAt: nowIso(),
  };
}

function summarizeFailure(state: DebuggingCoachState): string {
  const f = state.evidence.failure;
  if (!f) return "No failure evidence captured yet.";
  const parts: string[] = [];
  if (f.failureType) parts.push(f.failureType);
  if (f.errorMessage) parts.push(f.errorMessage);
  if (f.failingInput) parts.push(`on input: ${f.failingInput}`);
  return parts.length > 0 ? parts.join(" — ") : "Failure evidence present but no descriptive fields populated.";
}

function collectEvidenceRefs(state: DebuggingCoachState): string[] {
  const refs: string[] = [];
  if (state.evidence.failure) refs.push("failure");
  if (state.evidence.trace?.length) refs.push("trace");
  if (state.evidence.complexity) refs.push("complexity");
  if (state.evidence.quality) refs.push("quality");
  if (state.evidence.understanding) refs.push("understanding");
  return refs;
}

function summarizeRegression(state: DebuggingCoachState): string {
  if (!state.regressionState.lastRunAt) return "Regression suite was not run.";
  if (state.regressionState.passed) return "Regression suite passed.";
  const failing = state.regressionState.newlyFailingTestIds ?? [];
  return `Regression suite failed${failing.length ? ` (${failing.length} newly failing test${failing.length === 1 ? "" : "s"})` : ""}.`;
}

function buildKeyLearning(state: DebuggingCoachState): string {
  if (state.knownRootCause) return `The root cause was: ${state.knownRootCause}`;
  return "Root cause was not conclusively established in this session.";
}

const PRACTICE_ADVICE: Record<keyof ReturnType<typeof computeSkillSignals>, string> = {
  hypothesisQuality:
    "Try stating hypotheses as one specific, checkable claim about a single value or operation before testing them.",
  evidenceUsage: "Try tying each code change to a specific piece of evidence you observed first.",
  problemLocalization: "Try narrowing down exactly where behavior first diverges before forming a hypothesis.",
  experimentQuality: "Try writing down what you expect to observe before running an experiment, then compare.",
  rootCauseReasoning: "Try connecting your fix explicitly back to the evidence that supported your hypothesis.",
  fixReasoning: "Try double-checking that your fix addresses the root cause rather than just the symptom.",
  regressionAwareness: "Try running the full regression suite before declaring a fix complete.",
  debuggingEfficiency: "Try pausing after a couple of unsuccessful edits to form a hypothesis rather than continuing to guess.",
};

/** Templated (non-AI) so it stays available even when AI is down (Section 42). */
function buildRecommendedPractice(signals: ReturnType<typeof computeSkillSignals>): string {
  const entries = Object.entries(signals) as [keyof typeof signals, number][];
  const weakest = entries.sort((a, b) => a[1] - b[1])[0];
  return PRACTICE_ADVICE[weakest![0]];
}
