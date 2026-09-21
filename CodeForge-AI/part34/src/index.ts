// ============================================================================
// Public entry point. Import from here when wiring Feature 34 into the main
// CodeForge AI codebase — internal module paths under src/engine, src/domain
// etc. may be reorganized as this integrates further; this file is the
// stable surface.
// ============================================================================

export * from "./domain/types.js";
export * from "./domain/stateMachine.js";
export { buildBlueprint, validateBlueprint } from "./domain/blueprint.js";
export { BLUEPRINT_FACTORIES } from "./domain/blueprints/index.js";

export type { IntegrationPorts } from "./integration/ports.js";
export type { RepositoryBundle } from "./db/repositories.js";

export { buildContainer, type AppContainer, type ContainerOptions } from "./orchestration/container.js";
export { createInterview, type CreateInterviewInput, type CreateInterviewResult } from "./orchestration/createInterview.js";
export { createGapVerificationInterview } from "./orchestration/gapVerification.js";
export { getSession, startSession, pauseSession, resumeSession, recoverSession, cancelSession } from "./orchestration/sessionLifecycle.js";
export { requestNextQuestion, type NextQuestionOutcome } from "./orchestration/questionFlow.js";
export { submitResponse, type SubmitResponseInput, type SubmitResponseResult } from "./orchestration/submitResponse.js";
export { retryPendingEvaluation } from "./orchestration/retryEvaluation.js";
export { completeSession, type CompleteSessionResult } from "./orchestration/completeSession.js";
export { getInterviewHistory, getSessionEvaluations, getSessionSkillEvidence, getInterviewSummary, getInstitutionalReport } from "./orchestration/queries.js";
