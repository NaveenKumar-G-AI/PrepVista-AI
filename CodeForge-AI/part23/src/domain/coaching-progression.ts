// ============================================================================
// Coaching progression (Sections 17, 34-36)
// ============================================================================
// Two related but distinct concerns:
//  1. Trial-and-error detection: is the student editing/running in a loop
//     without hypothesis or evidence?
//  2. Progressive coaching escalation: how much help the student is getting,
//     and when that should increase — bounded by a server-authoritative
//     ceiling per CoachingMode the frontend cannot override (Section 34).
// ============================================================================

import {
  CoachingLevel,
  CoachingMode,
  COACHING_LEVEL_CEILING,
  COACHING_LEVEL_ORDER,
  StudentActionEvent,
} from "../types.js";

// --- Trial-and-error detection (Section 17) --------------------------------

export interface TrialAndErrorResult {
  detected: boolean;
  editRunCycles: number;
  message?: string;
}

const EDIT_RUN_TYPES = new Set(["EDIT_CODE", "RUN_CODE"]);
const HYPOTHESIS_ACTIVITY_TYPES = new Set(["CREATE_HYPOTHESIS", "UPDATE_HYPOTHESIS"]);
const REFLECTIVE_ACTIVITY_TYPES = new Set(["REQUEST_GUIDANCE", "RESPOND_TO_COACH"]);

/**
 * Looks at the most recent `windowSize` student actions. Flags trial-and-
 * error only when there are several edit/run cycles with neither hypothesis
 * activity nor any engagement with the coach in between. The returned
 * message is deliberately non-accusatory (Section 17: "Do not accuse the
 * student.").
 */
export function detectTrialAndError(actionLog: StudentActionEvent[], windowSize = 8, minCycles = 3): TrialAndErrorResult {
  const recent = actionLog.slice(-windowSize);
  const editRunCycles = recent.filter((a) => EDIT_RUN_TYPES.has(a.type)).length;
  const hasHypothesisActivity = recent.some((a) => HYPOTHESIS_ACTIVITY_TYPES.has(a.type));
  const hasReflectiveActivity = recent.some((a) => REFLECTIVE_ACTIVITY_TYPES.has(a.type));

  const detected = editRunCycles >= minCycles && !hasHypothesisActivity && !hasReflectiveActivity;

  return {
    detected,
    editRunCycles,
    message: detected
      ? "You've made several changes without establishing which behavior is responsible. Let's pause the edits and test one hypothesis at a time."
      : undefined,
  };
}

// --- Progressive coaching ladder (Sections 34-36) ---------------------------

/** Consecutive turns with no measurable progress before we escalate one rung. */
const STUCK_THRESHOLD = 2;

/**
 * "Progress" the ladder cares about: a new/changed hypothesis, newly
 * captured evidence, or a phase change. Computed by the caller (the
 * orchestrator has the old vs. new state to diff) rather than here, so this
 * module stays a pure function of booleans.
 */
export interface ProgressSignal {
  newHypothesisOrStatusChange: boolean;
  newEvidenceCaptured: boolean;
  phaseChanged: boolean;
}

export function hasProgressed(signal: ProgressSignal): boolean {
  return signal.newHypothesisOrStatusChange || signal.newEvidenceCaptured || signal.phaseChanged;
}

/**
 * Section 35: only escalate when evidence indicates the student needs it.
 * Section 34: never escalate past the mode's server-authoritative ceiling —
 * this function is the single place that enforces that cap, so an
 * "INTERVIEW" session can never be walked up to SOLUTION_EXPLANATION no
 * matter what the client sends.
 */
export function nextCoachingLevel(currentLevel: CoachingLevel, mode: CoachingMode, stuckSignalCount: number): CoachingLevel {
  const ceiling = COACHING_LEVEL_CEILING[mode];
  const ceilingIdx = COACHING_LEVEL_ORDER.indexOf(ceiling);
  const currentIdx = COACHING_LEVEL_ORDER.indexOf(currentLevel);

  // If already above the ceiling (e.g. mode was just switched to a stricter
  // one mid-session), clamp down immediately — the ceiling is a hard cap,
  // not a target to merely decay toward.
  if (currentIdx > ceilingIdx) return ceiling;
  if (stuckSignalCount < STUCK_THRESHOLD) return currentLevel;

  const nextIdx = Math.min(currentIdx + 1, ceilingIdx);
  // Non-null: nextIdx is clamped between two values that both came from
  // .indexOf on this same fixed-length array, so it is always in bounds.
  return COACHING_LEVEL_ORDER[nextIdx]!;
}

/** Baseline level to return to when the phase changes or new evidence resets the picture. */
export function resetCoachingLevel(mode: CoachingMode): CoachingLevel {
  const ceilingIdx = COACHING_LEVEL_ORDER.indexOf(COACHING_LEVEL_CEILING[mode]);
  const baselineIdx = COACHING_LEVEL_ORDER.indexOf(CoachingLevel.OBSERVATION);
  // Non-null: same reasoning as above.
  return COACHING_LEVEL_ORDER[Math.min(baselineIdx, ceilingIdx)]!;
}

/**
 * One coaching turn's worth of ladder update, bundled so callers can't
 * desync `coachingLevel` from `stuckSignalCount`.
 */
export function advanceCoachingProgression(
  current: { coachingLevel: CoachingLevel; coachingMode: CoachingMode; stuckSignalCount: number },
  progress: ProgressSignal
): { coachingLevel: CoachingLevel; stuckSignalCount: number } {
  if (hasProgressed(progress)) {
    return { coachingLevel: current.coachingLevel, stuckSignalCount: 0 };
  }
  const incremented = current.stuckSignalCount + 1;
  const escalated = nextCoachingLevel(current.coachingLevel, current.coachingMode, incremented);
  const didEscalate = escalated !== current.coachingLevel;
  return { coachingLevel: escalated, stuckSignalCount: didEscalate ? 0 : incremented };
}
