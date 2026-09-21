import type { DebugAction, DebugActionType, Experiment, ExperimentConclusion, Hypothesis, HypothesisStatus } from "../types.js";
import { EvidenceRequiredError } from "../types.js";

// ---------------------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------------------

export function createHypothesis(args: {
  id: string;
  sessionId: string;
  text: string;
  suspectedLocation?: string | null;
  suspectedCause?: string | null;
  confidence?: number;
}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: args.id,
    sessionId: args.sessionId,
    text: args.text,
    suspectedLocation: args.suspectedLocation ?? null,
    suspectedCause: args.suspectedCause ?? null,
    confidence: clamp(args.confidence ?? 50, 0, 100),
    status: "PROPOSED",
    createdAt: now,
    updatedAt: now
  };
}

/**
 * A hypothesis may only move to SUPPORTED or REJECTED if at least one
 * *resolved* experiment (conclusion !== null) points at it - i.e. "evidence-
 * based hypothesis elimination", not a status the student (or the AI coach)
 * can just declare. PROPOSED/TESTING/INCONCLUSIVE need no such evidence,
 * since they're transitional, non-judgmental states.
 *
 * A rejected hypothesis is not scored as poor performance by this function
 * or anything downstream - see debugging/skillModel.ts, which treats
 * rejected-with-evidence exactly like supported-with-evidence.
 */
export function resolveHypothesisStatus(
  hypothesis: Hypothesis,
  status: Extract<HypothesisStatus, "SUPPORTED" | "REJECTED">,
  experiments: Experiment[]
): Hypothesis {
  const hasResolvedExperiment = experiments.some((e) => e.hypothesisId === hypothesis.id && e.conclusion !== null);
  if (!hasResolvedExperiment) {
    throw new EvidenceRequiredError(
      `Cannot mark hypothesis "${hypothesis.id}" as ${status} without at least one resolved experiment testing it.`
    );
  }
  return { ...hypothesis, status, updatedAt: new Date().toISOString() };
}

export function setHypothesisStatus(
  hypothesis: Hypothesis,
  status: Extract<HypothesisStatus, "TESTING" | "INCONCLUSIVE">
): Hypothesis {
  return { ...hypothesis, status, updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export function createExperiment(args: {
  id: string;
  sessionId: string;
  hypothesisId: string;
  action: string;
  expectedResult: string;
}): Experiment {
  return {
    id: args.id,
    sessionId: args.sessionId,
    hypothesisId: args.hypothesisId,
    action: args.action,
    expectedResult: args.expectedResult,
    actualResult: null,
    conclusion: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };
}

export function resolveExperiment(experiment: Experiment, actualResult: string, conclusion: ExperimentConclusion): Experiment {
  return { ...experiment, actualResult, conclusion, resolvedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Action log
// ---------------------------------------------------------------------------

export function logAction(args: { id: string; sessionId: string; type: DebugActionType; metadata?: Record<string, unknown> }): DebugAction {
  return {
    id: args.id,
    sessionId: args.sessionId,
    type: args.type,
    // Deliberately shallow: callers should only pass non-sensitive metadata
    // (e.g. test id, hypothesis id) - never full env dumps or secrets.
    metadata: args.metadata ?? {},
    createdAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Random-edit ("trial and error") detection
// ---------------------------------------------------------------------------

export interface RandomEditSignal {
  detected: boolean;
  longestEditRunStreak: number;
  message: string | null;
}

export const EDIT_TYPES: ReadonlySet<DebugActionType> = new Set(["APPLY_CHANGE"]);
export const RUN_TYPES: ReadonlySet<DebugActionType> = new Set(["RUN", "RUN_FAILING_TEST", "RUN_SELECTED_TEST", "RUN_FULL_SUITE"]);
export const INVESTIGATIVE_TYPES: ReadonlySet<DebugActionType> = new Set([
  "CREATE_HYPOTHESIS",
  "INSPECT_OUTPUT",
  "INSPECT_VARIABLE",
  "INSPECT_TRACE"
]);

/**
 * Flags edit -> run -> edit -> run cycles that happen without any
 * intervening hypothesis or evidence inspection. This is descriptive, not
 * accusatory: it names a pattern, not a verdict on the student.
 */
export function detectRandomEditPattern(actions: DebugAction[], threshold = 3): RandomEditSignal {
  let streak = 0;
  let maxStreak = 0;
  let awaitingRunAfterEdit = false;

  for (const action of actions) {
    if (INVESTIGATIVE_TYPES.has(action.type)) {
      streak = 0;
      awaitingRunAfterEdit = false;
      continue;
    }
    if (EDIT_TYPES.has(action.type)) {
      awaitingRunAfterEdit = true;
      continue;
    }
    if (RUN_TYPES.has(action.type) && awaitingRunAfterEdit) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
      awaitingRunAfterEdit = false;
    }
  }

  const detected = maxStreak >= threshold;
  return {
    detected,
    longestEditRunStreak: maxStreak,
    message: detected
      ? "You relied heavily on trial-and-error changes. Try forming a testable hypothesis before modifying the implementation."
      : null
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
