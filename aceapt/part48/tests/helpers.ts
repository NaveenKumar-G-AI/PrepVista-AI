import {
  AssessmentMode,
  DependencyState,
  HintInteraction,
  HintOutcome,
  MistakeSignal,
  PolicyDecision,
  PolicyRequest,
  TriggerType,
} from "../src/domain/types";

export function baseRequest(overrides: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    studentId: "student-1",
    sessionId: "session-1",
    problemId: "percentage-basic-1",
    stepId: "execution",
    skillId: "PERCENTAGE",
    difficulty: "EASY",
    trigger: TriggerType.EXPLICIT_REQUEST,
    attempt: { raw: "16.67", isCorrect: false, mistakeSignal: MistakeSignal.WRONG_REFERENCE_VALUE },
    attemptCountOnStep: 1,
    sameErrorStreak: 1,
    timeOnStepMs: 20_000,
    medianTimeForStepMs: 30_000,
    priorHintsThisStep: [],
    priorOutcomesThisStep: [],
    dependencyState: DependencyState.MODERATE,
    assessmentMode: AssessmentMode.PRACTICE,
    hintsExplicitlyPermittedInAssessment: false,
    ...overrides,
  };
}

let counter = 0;
/** Builds a minimal, valid HintInteraction from a decision, for chaining escalation tests. */
export function interactionFrom(decision: PolicyDecision, req: PolicyRequest): HintInteraction {
  counter += 1;
  return {
    id: `test-interaction-${counter}`,
    sessionId: req.sessionId,
    studentId: req.studentId,
    problemId: req.problemId,
    stepId: req.stepId,
    attemptContextVersion: 1,
    trigger: req.trigger,
    blockType: decision.blockType,
    hintType: decision.hintType,
    hintLevel: decision.hintLevel,
    strategyTag: decision.strategyTag,
    revealsAnswer: decision.revealsAnswer,
    message: "test message",
    rationale: decision.rationale,
    requestedOrAutomatic: "REQUESTED",
    shownAt: new Date().toISOString(),
  };
}

export function outcomeFor(interaction: HintInteraction, result: HintOutcome["result"]): HintOutcome {
  return { interactionId: interaction.id, result, recordedAt: new Date().toISOString() };
}
