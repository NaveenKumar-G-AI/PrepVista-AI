import type {
  DebugAction,
  DebuggingReport,
  DebuggingResultStatus,
  DebuggingSession,
  Experiment,
  FailureFingerprint,
  Hypothesis,
  OverfittingSignal,
  RegressionVerification,
  RootCauseChain,
  SkillDimensionName,
  SkillDimensionScore,
  TimelineEvent
} from "../types.js";
import type { RootCauseValidation } from "./verification.js";
import { detectRandomEditPattern, RUN_TYPES } from "./investigation.js";

/**
 * Everything the scoring/report/timeline pipeline needs, gathered from the
 * repository layer by the API route before calling into this module. This
 * module itself never fetches anything - it only reasons over what it's
 * handed, which is what keeps every number in the output traceable back to
 * a concrete piece of session evidence.
 */
export interface SessionEvidenceBundle {
  session: DebuggingSession;
  fingerprint: FailureFingerprint | null;
  reproductionAttempts: number;
  reproduced: boolean;
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  actions: DebugAction[];
  rootCause: RootCauseChain | null;
  rootCauseValidation: RootCauseValidation | null;
  regression: RegressionVerification | null;
  overfitting: OverfittingSignal | null;
  hintsUsed: number;
  timestamps: {
    failureObservedAt: string | null;
    firstHypothesisAt: string | null;
    rootCauseIdentifiedAt: string | null;
    fixSubmittedAt: string | null;
    regressionVerifiedAt: string | null;
  };
}

export interface EfficiencyMetrics {
  timeToReproduceMs: number | null;
  timeToFirstHypothesisMs: number | null;
  timeToRootCauseMs: number | null;
  hypothesisCount: number;
  experimentCount: number;
  executionCount: number;
  unnecessaryEdits: number;
  hintUsage: number;
  successfulExperiments: number;
}

// ---------------------------------------------------------------------------
// Per-dimension scoring
// ---------------------------------------------------------------------------

function dim(
  dimension: SkillDimensionName,
  score: number,
  confidence: "LOW" | "MEDIUM" | "HIGH",
  evidence: string[],
  status: "SCORED" | "INSUFFICIENT_EVIDENCE"
): SkillDimensionScore {
  return { dimension, score: Math.round(clampScore(score)), confidence, evidence, status };
}

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function scoreFailureRecognition(b: SessionEvidenceBundle): SkillDimensionScore {
  if (!b.fingerprint) return dim("FAILURE_RECOGNITION", 0, "LOW", ["No failure fingerprint was captured."], "INSUFFICIENT_EVIDENCE");
  const evidence = [`Failure classified as ${b.fingerprint.failureType}.`];
  let score = 60;
  if (b.reproduced) {
    score += 40;
    evidence.push("Student successfully reproduced the failure.");
  } else {
    evidence.push("Failure was not confirmed reproduced.");
  }
  return dim("FAILURE_RECOGNITION", score, b.reproduced ? "HIGH" : "MEDIUM", evidence, "SCORED");
}

function scoreReproduction(b: SessionEvidenceBundle): SkillDimensionScore {
  const evidence = [`${b.reproductionAttempts} reproduction attempt(s) recorded.`];
  if (b.reproductionAttempts === 0) return dim("REPRODUCTION", 0, "LOW", evidence, "INSUFFICIENT_EVIDENCE");
  const score = b.reproduced ? Math.max(50, 100 - (b.reproductionAttempts - 1) * 10) : 20;
  evidence.push(b.reproduced ? "Failure was confirmed reproducible." : "Failure could not be consistently reproduced.");
  return dim("REPRODUCTION", score, "MEDIUM", evidence, "SCORED");
}

function scoreLocalization(b: SessionEvidenceBundle): SkillDimensionScore {
  const located = b.hypotheses.filter((h) => h.suspectedLocation);
  const evidence = [`${located.length} of ${b.hypotheses.length} hypothesis(es) named a suspected location.`];
  if (b.hypotheses.length === 0) return dim("LOCALIZATION", 0, "LOW", evidence, "INSUFFICIENT_EVIDENCE");

  const fnName = b.fingerprint?.sourceLocation?.function ?? null;
  const matchesFingerprint = fnName !== null && located.some((h) => h.suspectedLocation?.includes(fnName));
  let score = (located.length / b.hypotheses.length) * 60;
  if (matchesFingerprint) {
    score += 40;
    evidence.push("At least one hypothesis correctly named the failing location.");
  }
  return dim("LOCALIZATION", score, matchesFingerprint ? "HIGH" : "MEDIUM", evidence, "SCORED");
}

function scoreHypothesisFormation(b: SessionEvidenceBundle): SkillDimensionScore {
  const evidence = [`${b.hypotheses.length} hypothesis(es) created.`];
  if (b.hypotheses.length === 0) return dim("HYPOTHESIS_FORMATION", 0, "LOW", evidence, "INSUFFICIENT_EVIDENCE");
  const resolved = b.hypotheses.filter((h) => h.status === "SUPPORTED" || h.status === "REJECTED").length;
  evidence.push(`${resolved} hypothesis(es) resolved with evidence (supported or rejected - rejection counts equally).`);
  const score = b.hypotheses.length * 20 + resolved * 15;
  return dim("HYPOTHESIS_FORMATION", score, resolved > 0 ? "HIGH" : "MEDIUM", evidence, "SCORED");
}

function scoreEvidenceGathering(b: SessionEvidenceBundle): SkillDimensionScore {
  const inspecting = b.actions.filter((a) => a.type === "INSPECT_OUTPUT" || a.type === "INSPECT_VARIABLE" || a.type === "INSPECT_TRACE");
  if (b.actions.length === 0) return dim("EVIDENCE_GATHERING", 0, "LOW", ["No debugging actions logged."], "INSUFFICIENT_EVIDENCE");
  const evidence = [`${inspecting.length} evidence-inspection action(s) logged.`];
  return dim("EVIDENCE_GATHERING", inspecting.length * 15, inspecting.length >= 3 ? "HIGH" : "MEDIUM", evidence, "SCORED");
}

function scoreExperimentDesign(b: SessionEvidenceBundle): SkillDimensionScore {
  const evidence = [`${b.experiments.length} experiment(s) recorded.`];
  if (b.experiments.length === 0) return dim("EXPERIMENT_DESIGN", 0, "LOW", evidence, "INSUFFICIENT_EVIDENCE");
  const resolved = b.experiments.filter((e) => e.conclusion !== null);
  evidence.push(`${resolved.length} experiment(s) reached a conclusion.`);
  const score = resolved.length * 25 + (b.experiments.length - resolved.length) * 5;
  return dim("EXPERIMENT_DESIGN", score, resolved.length >= 2 ? "HIGH" : "MEDIUM", evidence, "SCORED");
}

function scoreRootCauseAnalysis(b: SessionEvidenceBundle): SkillDimensionScore {
  if (!b.rootCause || !b.rootCauseValidation) {
    return dim("ROOT_CAUSE_ANALYSIS", 0, "LOW", ["No root-cause chain was submitted for this session."], "INSUFFICIENT_EVIDENCE");
  }
  const evidence = [`Root-cause chain cited ${b.rootCause.supportingEvidence.length} piece(s) of supporting evidence.`];
  if (!b.rootCauseValidation.valid) {
    evidence.push(`Chain failed validation: ${b.rootCauseValidation.errors.join(", ")}.`);
    return dim("ROOT_CAUSE_ANALYSIS", 20, "LOW", evidence, "SCORED");
  }
  evidence.push("Chain passed evidence validation (non-empty symptom/location/cause/root cause, at least one evidence item).");
  return dim("ROOT_CAUSE_ANALYSIS", 60 + b.rootCause.supportingEvidence.length * 10, "HIGH", evidence, "SCORED");
}

function scoreFixQuality(b: SessionEvidenceBundle): SkillDimensionScore {
  if (!b.regression) return dim("FIX_QUALITY", 0, "LOW", ["No fix was submitted/verified for this session."], "INSUFFICIENT_EVIDENCE");
  const evidence = [`Regression verification overall: ${b.regression.overallPass ? "passed" : "failed"}.`];
  let score = b.regression.overallPass ? 80 : 30;
  if (b.overfitting?.suspected) {
    score -= 25;
    evidence.push(`Overfitting signal raised: ${b.overfitting.reasons.join(" ")}`);
  }
  return dim("FIX_QUALITY", score, "MEDIUM", evidence, "SCORED");
}

function scoreRegressionVerification(b: SessionEvidenceBundle): SkillDimensionScore {
  if (!b.regression) return dim("REGRESSION_VERIFICATION", 0, "LOW", ["No regression verification was run."], "INSUFFICIENT_EVIDENCE");
  const parts: Array<[string, boolean]> = [
    ["related tests", b.regression.relatedTestsPassed],
    ["hidden tests", b.regression.hiddenTestsPassed],
    ["regression tests", b.regression.regressionTestsPassed],
    ["resource tests", b.regression.resourceTestsPassed]
  ];
  const passedCount = parts.filter(([, passed]) => passed).length;
  const evidence = parts.map(([name, passed]) => `${name}: ${passed ? "passed" : "failed"}`);
  return dim("REGRESSION_VERIFICATION", (passedCount / parts.length) * 100, "HIGH", evidence, "SCORED");
}

function scoreDebuggingEfficiency(b: SessionEvidenceBundle, metrics: EfficiencyMetrics): SkillDimensionScore {
  if (metrics.executionCount === 0) {
    return dim("DEBUGGING_EFFICIENCY", 0, "LOW", ["No executions recorded."], "INSUFFICIENT_EVIDENCE");
  }
  const evidence = [
    `${metrics.executionCount} execution(s), ${metrics.hypothesisCount} hypothesis(es), ${metrics.hintUsage} hint(s) used.`
  ];
  // Efficiency must never dominate correctness (per spec) - kept as a mild
  // modifier around a neutral baseline, never a large swing.
  let score = 70;
  if (metrics.unnecessaryEdits >= 3) {
    score -= 20;
    evidence.push(`Detected a trial-and-error streak of ${metrics.unnecessaryEdits} edit/run cycles without intervening investigation.`);
  }
  if (metrics.hintUsage === 0 && b.rootCause) {
    score += 15;
    evidence.push("Root cause reached without hints.");
  }
  return dim("DEBUGGING_EFFICIENCY", score, "MEDIUM", evidence, "SCORED");
}

export function computeSkillProfile(bundle: SessionEvidenceBundle, metrics: EfficiencyMetrics): SkillDimensionScore[] {
  return [
    scoreFailureRecognition(bundle),
    scoreReproduction(bundle),
    scoreLocalization(bundle),
    scoreHypothesisFormation(bundle),
    scoreEvidenceGathering(bundle),
    scoreExperimentDesign(bundle),
    scoreRootCauseAnalysis(bundle),
    scoreFixQuality(bundle),
    scoreRegressionVerification(bundle),
    scoreDebuggingEfficiency(bundle, metrics)
  ];
}

// ---------------------------------------------------------------------------
// Efficiency metrics
// ---------------------------------------------------------------------------

export function computeEfficiencyMetrics(bundle: SessionEvidenceBundle): EfficiencyMetrics {
  const randomEdit = detectRandomEditPattern(bundle.actions);
  const executionCount = bundle.actions.filter((a) => RUN_TYPES.has(a.type)).length;
  const successfulExperiments = bundle.experiments.filter((e) => e.conclusion !== null).length;

  return {
    timeToReproduceMs: diffMs(bundle.session.startedAt, bundle.timestamps.failureObservedAt),
    timeToFirstHypothesisMs: diffMs(bundle.session.startedAt, bundle.timestamps.firstHypothesisAt),
    timeToRootCauseMs: diffMs(bundle.session.startedAt, bundle.timestamps.rootCauseIdentifiedAt),
    hypothesisCount: bundle.hypotheses.length,
    experimentCount: bundle.experiments.length,
    executionCount,
    unnecessaryEdits: randomEdit.longestEditRunStreak,
    hintUsage: bundle.hintsUsed,
    successfulExperiments
  };
}

function diffMs(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null;
  return new Date(endIso).getTime() - new Date(startIso).getTime();
}

// ---------------------------------------------------------------------------
// Overall result status
// ---------------------------------------------------------------------------

export function determineResultStatus(dimensions: SkillDimensionScore[]): DebuggingResultStatus {
  const scored = dimensions.filter((d) => d.status === "SCORED");
  if (scored.length < dimensions.length / 2) return "INSUFFICIENT_EVIDENCE";
  const avg = scored.reduce((sum, d) => sum + d.score, 0) / scored.length;
  if (avg >= 85) return "EXCELLENT_DEBUGGING";
  if (avg >= 70) return "STRONG_DEBUGGING";
  if (avg >= 50) return "DEVELOPING_DEBUGGING";
  return "WEAK_DEBUGGING";
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function buildTimeline(bundle: SessionEvidenceBundle): TimelineEvent[] {
  const events: TimelineEvent[] = [{ type: "SESSION_STARTED", at: bundle.session.startedAt }];

  if (bundle.timestamps.failureObservedAt) events.push({ type: "FAILURE_OBSERVED", at: bundle.timestamps.failureObservedAt });
  for (const h of bundle.hypotheses) events.push({ type: "HYPOTHESIS_CREATED", at: h.createdAt, detail: h.text });
  for (const e of bundle.experiments) {
    if (e.resolvedAt) events.push({ type: `EXPERIMENT_${e.conclusion}`, at: e.resolvedAt, detail: e.action });
  }
  if (bundle.timestamps.rootCauseIdentifiedAt) events.push({ type: "ROOT_CAUSE_IDENTIFIED", at: bundle.timestamps.rootCauseIdentifiedAt });
  if (bundle.timestamps.fixSubmittedAt) events.push({ type: "FIX_APPLIED", at: bundle.timestamps.fixSubmittedAt });
  if (bundle.timestamps.regressionVerifiedAt) events.push({ type: "REGRESSION_VERIFIED", at: bundle.timestamps.regressionVerifiedAt });
  if (bundle.session.endedAt) events.push({ type: `SESSION_${bundle.session.state}`, at: bundle.session.endedAt });

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<SkillDimensionName, string> = {
  FAILURE_RECOGNITION: "recognizing and classifying the failure",
  REPRODUCTION: "reliably reproducing the failure",
  LOCALIZATION: "localizing the failure to the right code",
  HYPOTHESIS_FORMATION: "forming testable hypotheses",
  EVIDENCE_GATHERING: "gathering execution evidence before acting",
  EXPERIMENT_DESIGN: "designing experiments that actually test a hypothesis",
  ROOT_CAUSE_ANALYSIS: "tracing symptom to root cause with evidence",
  FIX_QUALITY: "producing a fix that matches the root cause",
  REGRESSION_VERIFICATION: "verifying the fix doesn't break anything else",
  DEBUGGING_EFFICIENCY: "working efficiently without excessive trial-and-error"
};

export function buildReport(bundle: SessionEvidenceBundle, dimensions: SkillDimensionScore[]): DebuggingReport {
  const strengths = dimensions.filter((d) => d.status === "SCORED" && d.score >= 75).map((d) => `Strong at ${DIMENSION_LABELS[d.dimension]}.`);
  const improvements = dimensions
    .filter((d) => (d.status === "SCORED" && d.score < 50) || d.status === "INSUFFICIENT_EVIDENCE")
    .map((d) => `Could improve ${DIMENSION_LABELS[d.dimension]}.`);

  return {
    failureSummary: bundle.fingerprint
      ? `${bundle.fingerprint.failureType} on input: ${bundle.fingerprint.input ?? "(not captured)"}`
      : "No failure captured.",
    rootCauseSummary: bundle.rootCause ? bundle.rootCause.rootCause : "No validated root cause on record.",
    processSummary: `${bundle.hypotheses.length} hypothesis(es), ${bundle.experiments.length} experiment(s), ${bundle.actions.length} logged action(s).`,
    fixSummary: bundle.regression
      ? bundle.regression.overallPass
        ? "Fix verified against related, hidden, regression, and resource tests."
        : "Fix did not pass full verification."
      : "No fix submitted.",
    verificationSummary: bundle.overfitting?.suspected
      ? bundle.overfitting.reasons.join(" ")
      : bundle.regression
        ? "No overfitting signal detected."
        : "Verification not yet run.",
    strengths: strengths.length > 0 ? strengths : ["Not enough evidence yet to identify strengths."],
    improvements: improvements.length > 0 ? improvements : ["No specific improvement areas flagged."]
  };
}
