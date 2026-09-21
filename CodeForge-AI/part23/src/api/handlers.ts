// ============================================================================
// API handlers (Section 46)
// ============================================================================
// Framework-agnostic — adapt the thin wrapper to your actual router (Next.js
// Route Handlers, Express, Fastify, ...). Every handler:
//   - takes the authenticated userId explicitly, never from the request
//     body (Section 46: "Never trust client-provided ownership")
//   - applies rate limiting before doing any work
//   - relies on the repository (and, in production, Postgres RLS) as the
//     real ownership boundary — this layer is defense in depth, not the
//     only line of defense
//   - enforces the handful of hard business rules the spec calls out
//     explicitly (root cause requires a supported hypothesis; a fix
//     requires a root cause; postmortem requires RESOLVED) rather than
//     trusting the client to only call things in the right order
// ============================================================================

import { CoachRepository, ForbiddenError, NotFoundError } from "../db/repository.js";
import { AiProvider } from "../ai/providers.js";
import { orchestrateGuidance } from "../ai/orchestrator.js";
import { generatePostmortem } from "../domain/postmortem.js";
import { advancePhase } from "../domain/phase-model.js";
import { advanceCoachingProgression, detectTrialAndError, TrialAndErrorResult } from "../domain/coaching-progression.js";
import { createHypothesis, transitionHypothesis, canTransitionHypothesis } from "../domain/hypothesis-engine.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { scanForInjection } from "../security/prompt-injection-guard.js";
import {
  CoachingMode,
  CoachingLevel,
  DebuggingActionType,
  DebuggingCoachState,
  DebuggingEvidenceBundle,
  DebuggingPhase,
  DebuggingPostmortem,
  Experiment,
  HypothesisStatus,
  NextBestAction,
  StudentActionEvent,
  StudentActionType,
  StudentSkillLevel,
  newId,
  nowIso,
} from "../types.js";

export interface HandlerContext {
  userId: string;
  repository: CoachRepository;
  aiProvider?: AiProvider;
  rateLimiter: RateLimiter;
}

export class HandlerError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function requireRateLimit(ctx: HandlerContext, bucket: string): Promise<void> {
  const decision = await ctx.rateLimiter.check(`${bucket}:${ctx.userId}`);
  if (!decision.allowed) {
    throw new HandlerError(`Rate limit exceeded. Try again in ${Math.ceil((decision.retryAfterMs ?? 0) / 1000)}s.`, 429);
  }
}

async function loadOwnedState(ctx: HandlerContext, coachStateId: string): Promise<DebuggingCoachState> {
  try {
    const state = await ctx.repository.getState(ctx.userId, coachStateId);
    if (!state) throw new HandlerError("Debugging coach session not found.", 404);
    return state;
  } catch (err) {
    if (err instanceof HandlerError) throw err;
    if (err instanceof ForbiddenError) throw new HandlerError("Forbidden.", 403);
    if (err instanceof NotFoundError) throw new HandlerError("Debugging coach session not found.", 404);
    throw err;
  }
}

function applyPhaseProgression(state: DebuggingCoachState): DebuggingCoachState {
  const advanced = advancePhase(state);
  return advanced !== state.currentPhase ? { ...state, currentPhase: advanced } : state;
}

function collectKnownEvidenceTokens(state: DebuggingCoachState): string[] {
  const tokens = new Set<string>();
  const symbol = state.evidence.failure?.sourceLocation?.symbol;
  if (symbol) tokens.add(symbol);
  for (const t of state.evidence.trace ?? []) {
    for (const key of Object.keys(t.variables)) tokens.add(key);
  }
  for (const key of Object.keys(state.evidence.understanding?.variableUnderstanding ?? {})) tokens.add(key);
  return [...tokens];
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getCoachState(ctx: HandlerContext, coachStateId: string): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "read");
  return loadOwnedState(ctx, coachStateId);
}

export async function getCoachHistory(
  ctx: HandlerContext,
  coachStateId: string
): Promise<{ events: StudentActionEvent[]; recommendations: NextBestAction[] }> {
  await requireRateLimit(ctx, "read");
  await loadOwnedState(ctx, coachStateId); // ownership check even though repository.getHistory re-checks too
  return ctx.repository.getHistory(ctx.userId, coachStateId);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export interface InitCoachSessionInput {
  debuggingSessionId: string;
  coachingMode?: CoachingMode;
}

/** Idempotent: calling again for a debugging session that already has a coach state returns the existing one. */
export async function initCoachSession(ctx: HandlerContext, input: InitCoachSessionInput): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const existing = await ctx.repository.getStateBySession(ctx.userId, input.debuggingSessionId);
  if (existing) return existing;

  const now = nowIso();
  const state: DebuggingCoachState = {
    id: newId(),
    debuggingSessionId: input.debuggingSessionId,
    userId: ctx.userId,
    currentPhase: DebuggingPhase.OBSERVE,
    coachingMode: input.coachingMode ?? CoachingMode.SOCRATIC,
    coachingLevel: CoachingLevel.OBSERVATION,
    stuckSignalCount: 0,
    reproductionStatus: "NOT_ATTEMPTED",
    hypotheses: [],
    experiments: [],
    evidence: { capturedAt: now },
    fixState: {},
    regressionState: {},
    studentSkill: { level: StudentSkillLevel.INTERMEDIATE, priorSessionsCompleted: 0 },
    actionLog: [],
    recommendationHistory: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return ctx.repository.createState(state);
}

// ---------------------------------------------------------------------------
// Evidence ingestion (from Feature 22 / Features 16-21 — never fabricated)
// ---------------------------------------------------------------------------

export interface RecordEvidenceInput {
  evidence?: Partial<DebuggingEvidenceBundle>;
  reproductionStatus?: DebuggingCoachState["reproductionStatus"];
}

export async function recordEvidence(ctx: HandlerContext, coachStateId: string, input: RecordEvidenceInput): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  const nextState: DebuggingCoachState = {
    ...state,
    evidence: input.evidence ? { ...state.evidence, ...input.evidence, capturedAt: nowIso() } : state.evidence,
    reproductionStatus: input.reproductionStatus ?? state.reproductionStatus,
  };
  return ctx.repository.saveState(ctx.userId, applyPhaseProgression(nextState));
}

// ---------------------------------------------------------------------------
// Generic student action logging (Section 17, 32)
// ---------------------------------------------------------------------------

export async function recordStudentAction(
  ctx: HandlerContext,
  coachStateId: string,
  type: StudentActionType,
  payload?: Record<string, unknown>
): Promise<{ trialAndError: TrialAndErrorResult }> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  const event: StudentActionEvent = { id: newId(), type, at: nowIso(), payload };
  const nextLog = [...state.actionLog, event];
  await ctx.repository.saveState(ctx.userId, { ...state, actionLog: nextLog });
  return { trialAndError: detectTrialAndError(nextLog) };
}

// ---------------------------------------------------------------------------
// Hypotheses (Sections 10-14)
// ---------------------------------------------------------------------------

export interface SubmitHypothesisInput {
  statement: string;
  distinguishingTargets?: string[];
}

export interface SubmitHypothesisOutput {
  state: DebuggingCoachState;
  hypothesisId: string;
  injectionFlagged: boolean;
}

export async function submitHypothesis(ctx: HandlerContext, coachStateId: string, input: SubmitHypothesisInput): Promise<SubmitHypothesisOutput> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);

  // Injection scanning here is for observability/abuse monitoring, not a
  // hard gate — a student is allowed to write about "system calls" or
  // "ignore the edge case" in a genuine hypothesis. The AI-facing boundary
  // (untrusted wrapping) is enforced separately in ai/prompts.ts regardless
  // of this scan's result.
  const scan = scanForInjection(input.statement);

  const hypothesis = createHypothesis(input.statement, collectKnownEvidenceTokens(state), input.distinguishingTargets);
  const event: StudentActionEvent = {
    id: newId(),
    type: "CREATE_HYPOTHESIS",
    at: nowIso(),
    payload: { hypothesisId: hypothesis.id, injectionFlagged: scan.suspicious },
  };

  const nextState: DebuggingCoachState = {
    ...state,
    hypotheses: [...state.hypotheses, hypothesis],
    actionLog: [...state.actionLog, event],
  };

  const progression = advanceCoachingProgression(nextState, {
    newHypothesisOrStatusChange: true,
    newEvidenceCaptured: false,
    phaseChanged: false,
  });

  const saved = await ctx.repository.saveState(ctx.userId, {
    ...applyPhaseProgression(nextState),
    coachingLevel: progression.coachingLevel,
    stuckSignalCount: progression.stuckSignalCount,
  });

  return { state: saved, hypothesisId: hypothesis.id, injectionFlagged: scan.suspicious };
}

export interface UpdateHypothesisStatusInput {
  hypothesisId: string;
  status: HypothesisStatus;
  resolutionEvidence?: string;
}

export async function updateHypothesisStatus(
  ctx: HandlerContext,
  coachStateId: string,
  input: UpdateHypothesisStatusInput
): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  const idx = state.hypotheses.findIndex((h) => h.id === input.hypothesisId);
  if (idx === -1) throw new HandlerError("Hypothesis not found.", 404);

  const current = state.hypotheses[idx]!;
  if (!canTransitionHypothesis(current.status, input.status)) {
    throw new HandlerError(`Cannot move a hypothesis from ${current.status} to ${input.status}.`, 400);
  }

  const hypotheses = [...state.hypotheses];
  hypotheses[idx] = transitionHypothesis(current, input.status, input.resolutionEvidence);

  const nextState = { ...state, hypotheses };
  const progression = advanceCoachingProgression(nextState, {
    newHypothesisOrStatusChange: true,
    newEvidenceCaptured: false,
    phaseChanged: false,
  });

  return ctx.repository.saveState(ctx.userId, {
    ...applyPhaseProgression(nextState),
    coachingLevel: progression.coachingLevel,
    stuckSignalCount: progression.stuckSignalCount,
  });
}

// ---------------------------------------------------------------------------
// Experiments (Section 15-16) — the hypothesis -> expected observation ->
// experiment -> actual observation -> interpretation cycle.
// ---------------------------------------------------------------------------

export interface RecordExperimentInput {
  hypothesisId: string;
  action: DebuggingActionType;
  target?: string;
  expectedObservation: string;
  actualObservation: string;
  interpretation: string;
}

export async function recordExperiment(ctx: HandlerContext, coachStateId: string, input: RecordExperimentInput): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  if (!state.hypotheses.some((h) => h.id === input.hypothesisId)) {
    throw new HandlerError("Unknown hypothesis id.", 404);
  }

  const experiment: Experiment = {
    id: newId(),
    hypothesisId: input.hypothesisId,
    expectedObservation: input.expectedObservation,
    action: input.action,
    target: input.target,
    actualObservation: input.actualObservation,
    interpretation: input.interpretation,
    createdAt: nowIso(),
    completedAt: nowIso(),
  };

  const nextState: DebuggingCoachState = { ...state, experiments: [...state.experiments, experiment] };
  const progression = advanceCoachingProgression(nextState, {
    newHypothesisOrStatusChange: false,
    newEvidenceCaptured: true,
    phaseChanged: false,
  });

  return ctx.repository.saveState(ctx.userId, {
    ...applyPhaseProgression(nextState),
    coachingLevel: progression.coachingLevel,
    stuckSignalCount: progression.stuckSignalCount,
  });
}

// ---------------------------------------------------------------------------
// Root cause / fix / regression (Sections 24-29)
// ---------------------------------------------------------------------------

/** Section 25: require a SUPPORTED hypothesis before accepting a root-cause claim at all. */
export async function recordRootCause(ctx: HandlerContext, coachStateId: string, rootCause: string): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  const hasSupportedHypothesis = state.hypotheses.some((h) => h.status === HypothesisStatus.SUPPORTED);
  if (!hasSupportedHypothesis) {
    throw new HandlerError("A root cause can only be recorded once a hypothesis has been SUPPORTED by evidence.", 400);
  }
  return ctx.repository.saveState(ctx.userId, applyPhaseProgression({ ...state, knownRootCause: rootCause }));
}

export async function proposeFix(ctx: HandlerContext, coachStateId: string, description: string): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  if (!state.knownRootCause) {
    throw new HandlerError("Cannot propose a fix before a root cause has been recorded.", 400);
  }
  return ctx.repository.saveState(ctx.userId, applyPhaseProgression({ ...state, fixState: { ...state.fixState, proposed: description } }));
}

export interface MarkFixAppliedInput {
  /** Authoritative signal — from Feature 22 / a static check, never from the AI (Section 38). */
  alignsWithRootCause: boolean;
}

export async function markFixApplied(ctx: HandlerContext, coachStateId: string, input: MarkFixAppliedInput): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  if (!state.fixState.proposed) throw new HandlerError("No fix has been proposed yet.", 400);
  const nextState = {
    ...state,
    fixState: { ...state.fixState, appliedAt: nowIso(), alignsWithRootCause: input.alignsWithRootCause },
  };
  return ctx.repository.saveState(ctx.userId, applyPhaseProgression(nextState));
}

export interface RecordRegressionInput {
  passed: boolean;
  newlyFailingTestIds?: string[];
}

export async function recordRegressionResult(ctx: HandlerContext, coachStateId: string, input: RecordRegressionInput): Promise<DebuggingCoachState> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  const nextState: DebuggingCoachState = {
    ...state,
    regressionState: { lastRunAt: nowIso(), passed: input.passed, newlyFailingTestIds: input.newlyFailingTestIds },
    actionLog: [...state.actionLog, { id: newId(), type: "RUN_REGRESSION", at: nowIso() }],
  };
  return ctx.repository.saveState(ctx.userId, applyPhaseProgression(nextState));
}

// ---------------------------------------------------------------------------
// Guidance (the AI-backed endpoint — its own, stricter rate-limit bucket)
// ---------------------------------------------------------------------------

export interface RequestGuidanceInput {
  studentFreeText?: string;
}

export interface RequestGuidanceOutput {
  nextBestAction: NextBestAction;
  aiAvailable: boolean;
  aiError?: string;
}

export async function requestGuidance(
  ctx: HandlerContext,
  coachStateId: string,
  input: RequestGuidanceInput = {}
): Promise<RequestGuidanceOutput> {
  await requireRateLimit(ctx, "guidance"); // separate, stricter bucket from plain reads/writes (Section 44)
  const state = await loadOwnedState(ctx, coachStateId);

  const result = await orchestrateGuidance(state, ctx.aiProvider, { studentFreeText: input.studentFreeText });

  await ctx.repository.appendRecommendation(ctx.userId, coachStateId, result.nextBestAction);
  await ctx.repository.appendActionEvent(ctx.userId, coachStateId, {
    id: newId(),
    type: "REQUEST_GUIDANCE",
    at: nowIso(),
    payload: { aiGenerated: result.nextBestAction.aiGenerated },
  });

  return { nextBestAction: result.nextBestAction, aiAvailable: result.aiAvailable, aiError: result.aiError };
}

// ---------------------------------------------------------------------------
// Postmortem (Section 31) — only once actually resolved
// ---------------------------------------------------------------------------

export async function requestPostmortem(ctx: HandlerContext, coachStateId: string): Promise<DebuggingPostmortem> {
  await requireRateLimit(ctx, "write");
  const state = await loadOwnedState(ctx, coachStateId);
  if (state.currentPhase !== DebuggingPhase.RESOLVED) {
    throw new HandlerError("Postmortem is only available once the session has reached RESOLVED.", 400);
  }
  const postmortem = generatePostmortem(state);
  await ctx.repository.savePostmortem(ctx.userId, coachStateId, postmortem);
  return postmortem;
}
