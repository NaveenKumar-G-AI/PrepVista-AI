// ============================================================================
// Next-best-action engine (Sections 7-9, 39-40)
// ============================================================================
// This is "the central component." It is fully deterministic — no AI in this
// file — because Section 38 requires that action *selection* stay
// authoritative/deterministic; the AI layer (src/ai/orchestrator.ts) is only
// allowed to choose the coaching *language* around whichever action this
// engine ranks highest, and to pick among this engine's own top candidates.
// It may never invent an action outside DebuggingActionType (Section 40).
// ============================================================================

import {
  ALL_ACTION_TYPES,
  ConfidenceLevel,
  DebuggingActionType,
  DebuggingCoachState,
  DebuggingPhase,
  HypothesisStatus,
  InformationGain,
  INFORMATION_GAIN_WEIGHT,
  NextBestAction,
  RankedAction,
  StudentSkillLevel,
  clamp01,
} from "../types.js";
import { PHASE_CANONICAL_QUESTION } from "./phase-model.js";

/** Phases each action is typically useful in. Not exclusive — actions outside
 * their typical phases are simply penalized, not forbidden, since debugging
 * is not perfectly linear. */
export const ACTION_TYPICAL_PHASES: Record<DebuggingActionType, DebuggingPhase[]> = {
  REPRODUCE_FAILURE: [DebuggingPhase.OBSERVE, DebuggingPhase.REPRODUCE],
  COMPARE_EXPECTED_ACTUAL: [DebuggingPhase.OBSERVE, DebuggingPhase.LOCALIZE],
  INSPECT_OUTPUT: [DebuggingPhase.OBSERVE, DebuggingPhase.LOCALIZE],
  INSPECT_VARIABLE: [DebuggingPhase.LOCALIZE, DebuggingPhase.INVESTIGATE, DebuggingPhase.EXPERIMENT],
  INSPECT_TRACE: [DebuggingPhase.LOCALIZE, DebuggingPhase.INVESTIGATE, DebuggingPhase.EXPERIMENT],
  CHECK_SOURCE_LOCATION: [DebuggingPhase.LOCALIZE],
  CREATE_HYPOTHESIS: [DebuggingPhase.HYPOTHESIZE],
  REFINE_HYPOTHESIS: [DebuggingPhase.HYPOTHESIZE],
  TEST_HYPOTHESIS: [DebuggingPhase.EXPERIMENT],
  RUN_TARGETED_CASE: [DebuggingPhase.EXPERIMENT, DebuggingPhase.VERIFY],
  COMPARE_STATES: [DebuggingPhase.INVESTIGATE, DebuggingPhase.EXPERIMENT],
  CHECK_INVARIANT: [DebuggingPhase.INVESTIGATE, DebuggingPhase.ROOT_CAUSE],
  ISOLATE_FUNCTION: [DebuggingPhase.INVESTIGATE, DebuggingPhase.EXPERIMENT],
  CHECK_CALL_CHAIN: [DebuggingPhase.INVESTIGATE],
  CHECK_EDGE_CASE: [DebuggingPhase.EXPERIMENT, DebuggingPhase.VERIFY],
  CHECK_COMPLEXITY: [DebuggingPhase.INVESTIGATE, DebuggingPhase.ROOT_CAUSE],
  APPLY_FIX: [DebuggingPhase.FIX],
  RUN_REGRESSION: [DebuggingPhase.VERIFY],
  REFLECT_ON_ROOT_CAUSE: [DebuggingPhase.ROOT_CAUSE, DebuggingPhase.RESOLVED],
};

/** Relative cost/risk, 0 (cheap, safe, reversible) .. 1 (expensive or risky). */
const ACTION_BASE_COST: Record<DebuggingActionType, number> = {
  REPRODUCE_FAILURE: 0.15,
  COMPARE_EXPECTED_ACTUAL: 0.1,
  INSPECT_OUTPUT: 0.1,
  INSPECT_VARIABLE: 0.15,
  INSPECT_TRACE: 0.2,
  CHECK_SOURCE_LOCATION: 0.1,
  CREATE_HYPOTHESIS: 0.1,
  REFINE_HYPOTHESIS: 0.1,
  TEST_HYPOTHESIS: 0.25,
  RUN_TARGETED_CASE: 0.3,
  COMPARE_STATES: 0.2,
  CHECK_INVARIANT: 0.2,
  ISOLATE_FUNCTION: 0.35,
  CHECK_CALL_CHAIN: 0.25,
  CHECK_EDGE_CASE: 0.25,
  CHECK_COMPLEXITY: 0.15,
  APPLY_FIX: 0.6,
  RUN_REGRESSION: 0.5,
  REFLECT_ON_ROOT_CAUSE: 0.1,
};

/** Actions whose main purpose is discriminating between competing hypotheses.
 * Deliberately excludes coarser, harder-to-attribute actions like
 * ISOLATE_FUNCTION or APPLY_FIX — Section 9's core point is that a broad
 * action can look "relevant" while a competing hypothesis is live without
 * actually producing evidence that separates the candidates. */
const DISTINGUISHING_ACTIONS = new Set<DebuggingActionType>([
  DebuggingActionType.INSPECT_VARIABLE,
  DebuggingActionType.INSPECT_TRACE,
  DebuggingActionType.TEST_HYPOTHESIS,
  DebuggingActionType.COMPARE_STATES,
  DebuggingActionType.CHECK_INVARIANT,
  DebuggingActionType.RUN_TARGETED_CASE,
]);

/** Coarse-grained actions that touch a lot of surface area at once — high
 * cost, low attribution — and so should not be treated as informative just
 * because hypotheses happen to be live (Section 9). */
const BROAD_LOW_ATTRIBUTION_ACTIONS = new Set<DebuggingActionType>([
  DebuggingActionType.ISOLATE_FUNCTION,
  DebuggingActionType.APPLY_FIX,
]);

/** Which evidence field an action depends on. If that evidence is absent we
 * must not recommend the action — Section 6: "Never fabricate missing data." */
function requiredEvidencePresent(action: DebuggingActionType, state: DebuggingCoachState): boolean {
  const ev = state.evidence;
  switch (action) {
    case DebuggingActionType.INSPECT_TRACE:
    case DebuggingActionType.COMPARE_STATES:
      return !!ev.trace && ev.trace.length > 0;
    case DebuggingActionType.CHECK_COMPLEXITY:
      return !!ev.complexity;
    case DebuggingActionType.COMPARE_EXPECTED_ACTUAL:
    case DebuggingActionType.INSPECT_OUTPUT:
      return !!ev.failure && (ev.failure.expectedOutput !== undefined || ev.failure.actualOutput !== undefined);
    case DebuggingActionType.CHECK_SOURCE_LOCATION:
      return !!ev.failure?.sourceLocation;
    default:
      return true; // action does not strictly require a specific evidence field
  }
}

/** Hard safety gates — filtered out entirely, never just down-ranked
 * (Section 8: "safety" is a ranking input, but some actions are simply unsafe
 * to recommend before their preconditions hold, e.g. applying a fix with no
 * root cause is not "lower value", it's premature). */
function isSafeToRecommend(action: DebuggingActionType, state: DebuggingCoachState): boolean {
  switch (action) {
    case DebuggingActionType.APPLY_FIX:
      return !!state.knownRootCause || state.hypotheses.some((h) => h.status === HypothesisStatus.SUPPORTED);
    case DebuggingActionType.RUN_REGRESSION:
      return !!state.fixState.proposed || !!state.fixState.appliedAt;
    case DebuggingActionType.REFLECT_ON_ROOT_CAUSE:
      return !!state.knownRootCause || state.regressionState.passed === true;
    default:
      return true;
  }
}

function computeInformationGain(action: DebuggingActionType, state: DebuggingCoachState): InformationGain {
  const live = state.hypotheses.filter(
    (h) => h.status === HypothesisStatus.PROPOSED || h.status === HypothesisStatus.TESTING
  );

  if (!requiredEvidencePresent(action, state)) return InformationGain.LOW;

  // Broad, hard-to-attribute actions carry little diagnostic signal relative
  // to their cost while hypotheses are still competing — Section 9's core
  // example ("changing five lines at once provides almost no information").
  // Checked before the distinguishing-action branch so it can never be
  // shadowed by a broader match.
  if (BROAD_LOW_ATTRIBUTION_ACTIONS.has(action) && live.length >= 2) {
    return InformationGain.LOW;
  }

  if (live.length >= 2 && DISTINGUISHING_ACTIONS.has(action)) return InformationGain.HIGH;
  if (live.length === 1 && DISTINGUISHING_ACTIONS.has(action)) return InformationGain.MEDIUM;

  if (
    [
      DebuggingActionType.REPRODUCE_FAILURE,
      DebuggingActionType.COMPARE_EXPECTED_ACTUAL,
      DebuggingActionType.INSPECT_OUTPUT,
      DebuggingActionType.CHECK_SOURCE_LOCATION,
      DebuggingActionType.CREATE_HYPOTHESIS,
    ].includes(action)
  ) {
    return InformationGain.MEDIUM;
  }

  return InformationGain.MEDIUM;
}

function phaseMatchScore(action: DebuggingActionType, phase: DebuggingPhase): number {
  const typical = ACTION_TYPICAL_PHASES[action];
  if (typical.includes(phase)) return 1.0;
  return 0.3;
}

function skillAdjustment(action: DebuggingActionType, level: StudentSkillLevel): number {
  const structural = new Set([
    DebuggingActionType.COMPARE_EXPECTED_ACTUAL,
    DebuggingActionType.INSPECT_OUTPUT,
    DebuggingActionType.CREATE_HYPOTHESIS,
    DebuggingActionType.REPRODUCE_FAILURE,
  ]);
  const independent = new Set([
    DebuggingActionType.TEST_HYPOTHESIS,
    DebuggingActionType.ISOLATE_FUNCTION,
    DebuggingActionType.CHECK_INVARIANT,
    DebuggingActionType.CHECK_CALL_CHAIN,
  ]);
  if (level === StudentSkillLevel.BEGINNER && structural.has(action)) return 0.08;
  if (level === StudentSkillLevel.ADVANCED && independent.has(action)) return 0.08;
  return 0;
}

/** Discourage repeating a recommendation that didn't produce new evidence
 * (Section 36: coaching memory / non-repetition). Looks at the most recent
 * recommendations only — an action can always become relevant again later
 * once new evidence resets the picture. */
function repetitionPenalty(action: DebuggingActionType, target: string | undefined, state: DebuggingCoachState): number {
  const recent = state.recommendationHistory.slice(-3);
  const repeats = recent.filter((r) => r.recommendedAction === action && r.target === target).length;
  if (repeats === 0) return 0;
  return Math.min(0.85, repeats * 0.35);
}

export interface RankActionsResult {
  ranked: RankedAction[];
  top: RankedAction | undefined;
}

/**
 * Rank every action in the taxonomy for the current state and return them
 * best-first. `candidateTargets` lets a caller pass known distinguishing
 * targets (e.g. variable names pulled from live hypotheses) so INSPECT_*
 * actions can be scored per-target rather than only per-action-type.
 */
export function rankActions(state: DebuggingCoachState): RankedAction[] {
  const targets = collectCandidateTargets(state);

  const scored: RankedAction[] = [];

  for (const action of ALL_ACTION_TYPES) {
    if (!isSafeToRecommend(action, state)) continue;

    const relevantTargets = DISTINGUISHING_ACTIONS.has(action) && targets.length > 0 ? targets : [undefined];

    for (const target of relevantTargets) {
      const infoGain = computeInformationGain(action, state);
      const infoGainWeight = INFORMATION_GAIN_WEIGHT[infoGain];
      const evidenceRelevance = requiredEvidencePresent(action, state) ? 1 : 0.15;
      const phaseMatch = phaseMatchScore(action, state.currentPhase);
      const costPenalty = 1 - ACTION_BASE_COST[action];
      const skillBonus = skillAdjustment(action, state.studentSkill.level);
      const repetition = repetitionPenalty(action, target, state);

      const rawScore =
        0.35 * infoGainWeight +
        0.2 * evidenceRelevance +
        0.15 * phaseMatch +
        0.15 * costPenalty +
        skillBonus -
        repetition;

      scored.push({
        action,
        target,
        score: clamp01(rawScore),
        informationGain: infoGain,
        reason: buildReason(action, infoGain, phaseMatch, state),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

function collectCandidateTargets(state: DebuggingCoachState): string[] {
  const targets = new Set<string>();
  for (const h of state.hypotheses) {
    if (h.status === HypothesisStatus.PROPOSED || h.status === HypothesisStatus.TESTING) {
      for (const t of h.distinguishingTargets ?? []) targets.add(t);
    }
  }
  return [...targets];
}

function buildReason(action: DebuggingActionType, gain: InformationGain, phaseMatch: number, state: DebuggingCoachState): string {
  const live = state.hypotheses.filter(
    (h) => h.status === HypothesisStatus.PROPOSED || h.status === HypothesisStatus.TESTING
  ).length;
  if (gain === InformationGain.HIGH && live >= 2) {
    return `${live} competing hypotheses are still live; this action produces evidence that can separate them.`;
  }
  if (phaseMatch === 1.0) {
    return `Matches the current phase (${state.currentPhase}) and the evidence already available.`;
  }
  return `Available option, though not the primary fit for the current phase (${state.currentPhase}).`;
}

/**
 * Produce the full NextBestAction envelope (Section 39) from purely
 * deterministic signals — no AI. The AI orchestrator layer wraps this with
 * personalized coaching language but must not override `recommendedAction`
 * with anything outside `candidates`.
 */
export function selectNextBestAction(state: DebuggingCoachState, coachingLevel: import("../types.js").CoachingLevel): NextBestAction {
  const ranked = rankActions(state);
  const top = ranked[0];

  if (!top) {
    // Every candidate got safety-gated out — should only happen in a
    // just-created, empty state. Fall back to the phase's canonical opener.
    return {
      phase: state.currentPhase,
      recommendedAction: DebuggingActionType.REPRODUCE_FAILURE,
      reason: "No ranked candidates were safe to recommend yet; defaulting to the phase opener.",
      evidenceRefs: [],
      expectedInformationGain: InformationGain.MEDIUM,
      coachingLevel,
      question: PHASE_CANONICAL_QUESTION[state.currentPhase],
      confidence: ConfidenceLevel.LOW,
      aiGenerated: false,
      candidates: [],
    };
  }

  const confidence: ConfidenceLevel =
    top.score >= 0.7 ? ConfidenceLevel.HIGH : top.score >= 0.45 ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW;

  return {
    phase: state.currentPhase,
    recommendedAction: top.action,
    target: top.target,
    reason: top.reason,
    evidenceRefs: evidenceRefsFor(top.action, state),
    expectedInformationGain: top.informationGain,
    coachingLevel,
    question: PHASE_CANONICAL_QUESTION[state.currentPhase],
    confidence,
    aiGenerated: false,
    candidates: ranked.slice(0, 5),
  };
}

function evidenceRefsFor(action: DebuggingActionType, state: DebuggingCoachState): string[] {
  const refs: string[] = [];
  if (state.evidence.failure && [DebuggingActionType.COMPARE_EXPECTED_ACTUAL, DebuggingActionType.INSPECT_OUTPUT].includes(action)) {
    refs.push("failure");
  }
  if (state.evidence.trace && [DebuggingActionType.INSPECT_TRACE, DebuggingActionType.COMPARE_STATES].includes(action)) {
    refs.push("trace");
  }
  if (state.evidence.complexity && action === DebuggingActionType.CHECK_COMPLEXITY) {
    refs.push("complexity");
  }
  return refs;
}
