/**
 * Hint Ladder service — the single orchestration entry point called by
 * the API route handlers. Nothing in src/app/api/hint-ladder/* talks to
 * the repository, the policy engine, or an AI provider directly; it all
 * goes through handleHintRequest() so there is exactly one place that
 * enforces the full request lifecycle (auth -> rate limit -> idempotency
 * -> mode resolution -> evidence -> policy -> generation -> guard ->
 * persistence).
 */

import { analyzeEvidence } from "./evidence-analyzer";
import { locateRelevantCode } from "./code-locator";
import { buildRootIssueHypothesis } from "./root-issue";
import { buildTargetSignature } from "./anti-repetition";
import { generateHint } from "./ai-hint-generator";
import { DEFAULT_MODE_POLICY_LIMITS, decideNextAction, ModePolicyLimits, PolicyDecision } from "./policy-engine";
import { PromptContext } from "./prompt-builder";
import { ProviderRouter } from "./providers/router";
import { RateLimiter } from "./rate-limit";
import { AuthError, ConcurrencyConflictError, OwnershipError, RateLimitError, ValidationError } from "./errors";
import { ApplyTransitionInput, HintLadderRepository, NewHintEventInput } from "./repository/types";
import {
  AssistanceLevel,
  CodeLocation,
  Confidence,
  DeliveredHintRecord,
  HintLadderState,
  HintRequestInput,
  HintType,
  RootIssueHypothesis,
  StudentResponseSignal,
} from "./types";
import { ExistingSystemsAdapter } from "../stand-ins/existing-systems-adapter";

export interface HintLadderServiceDeps {
  repository: HintLadderRepository;
  existingSystems: ExistingSystemsAdapter;
  router: ProviderRouter;
  rateLimiter: RateLimiter;
  modeLimits: ModePolicyLimits;
  now: () => string;
}

export function defaultDeps(overrides: Partial<HintLadderServiceDeps> & Pick<HintLadderServiceDeps, "repository" | "existingSystems" | "router" | "rateLimiter">): HintLadderServiceDeps {
  return {
    modeLimits: DEFAULT_MODE_POLICY_LIMITS,
    now: () => new Date().toISOString(),
    ...overrides,
  };
}

export interface HintPayload {
  hintType: HintType;
  observation: string;
  text: string;
  targetArea: string | null;
  confidence: Confidence;
  codeLocation: CodeLocation | null;
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK" | "TEMPLATED_RESOLUTION";
}

export interface HintResponsePayload {
  sessionId: string;
  status: HintLadderState["status"];
  currentLevel: AssistanceLevel;
  kind: PolicyDecision["kind"];
  hint: HintPayload | null;
  templatedMessage: string | null;
  denialReason: string | null;
  offerSolutionOption: boolean;
  progression: Array<{ level: AssistanceLevel; reached: boolean; current: boolean }>;
}

function classifyStudentResponse(input: HintRequestInput["studentResponse"]): StudentResponseSignal | null {
  if (!input) return null;
  if (input.type === "QUICK_ACTION") {
    const map: Record<string, StudentResponseSignal> = {
      understood: "UNDERSTOOD",
      still_stuck: "STILL_STUCK",
      ask_for_more: "ASKED_FOR_MORE",
      ask_question: "ASKED_QUESTION",
    };
    return map[input.value] ?? "NONE";
  }
  // Free text: only classify the handful of unambiguous patterns
  // deterministically (no LLM call for this — see cost-control rules).
  // Anything else is passed through to the prompt as additional context
  // rather than mis-classified as a confident signal.
  const text = input.value.trim().toLowerCase();
  if (/^i understand|got it|that (helped|makes sense)/.test(text)) return "UNDERSTOOD";
  if (/still (don'?t|do not) (get|understand)|still stuck|still confused/.test(text)) return "STILL_STUCK";
  if (/show me|give me the solution|just tell me/.test(text)) return "REQUESTED_SOLUTION";
  if (/\?$/.test(text)) return "ASKED_QUESTION";
  return "NONE";
}

const ALL_LEVELS: AssistanceLevel[] = ["INDEPENDENT", "DIRECTION", "CONCEPT", "TARGETED", "SPECIFIC", "DETAILED", "SOLUTION_ASSISTANCE"];

function buildProgression(currentLevel: AssistanceLevel): HintResponsePayload["progression"] {
  const currentIdx = ALL_LEVELS.indexOf(currentLevel);
  return ALL_LEVELS.filter((l) => l !== "INDEPENDENT").map((level) => ({
    level,
    reached: ALL_LEVELS.indexOf(level) <= currentIdx,
    current: level === currentLevel,
  }));
}

export async function handleHintRequest(params: {
  deps: HintLadderServiceDeps;
  studentId: string | null;
  input: HintRequestInput;
}): Promise<HintResponsePayload> {
  const { deps, studentId, input } = params;

  // --- 1. Auth --------------------------------------------------------
  if (!studentId) throw new AuthError();

  // --- 2. Rate limiting -------------------------------------------------
  const retryAfterMs = deps.rateLimiter.check(`${studentId}:${input.problemId}`);
  if (retryAfterMs !== null) throw new RateLimitError(retryAfterMs);

  // --- 3. Server-resolved mode (never trust a client-provided mode) ------
  const mode = await deps.existingSystems.resolveMode(studentId, input.problemId);

  // Steps 4-9 are wrapped in an optimistic-concurrency retry loop: two
  // rapid identical taps (or a hint request racing an unrelated write to
  // the same session) can both read the same version and race to write.
  // The loser must never surface a raw 409 to the student for what is
  // fundamentally benign contention — it re-checks the idempotency cache
  // (the winner, if it was a literal duplicate request, will have cached
  // a response by then) and otherwise retries the whole decide-and-write
  // cycle against freshly-read state, exactly like a normal DB-level
  // optimistic-concurrency retry.
  const MAX_ATTEMPTS = 5;
  let lastConflict: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // --- 4. Load or create session, verify ownership ------------------------
    const now = deps.now();
    const state = await deps.repository.getOrCreateSession({ studentId, problemId: input.problemId, mode, now });
    if (state.studentId !== studentId) throw new OwnershipError();

    // --- 5. Idempotency ---------------------------------------------------
    const cached = await deps.repository.getCachedResponse(state.sessionId, input.requestId);
    if (cached) return cached as HintResponsePayload;

    try {
      return await processAgainstState(deps, studentId, input, mode, state);
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        lastConflict = err;
        continue; // retry the full read-decide-write cycle against fresh state
      }
      throw err;
    }
  }

  throw lastConflict instanceof Error ? lastConflict : new ConcurrencyConflictError("Exhausted retries under contention.");
}

async function processAgainstState(
  deps: HintLadderServiceDeps,
  studentId: string,
  input: HintRequestInput,
  mode: HintLadderState["mode"],
  state: HintLadderState
): Promise<HintResponsePayload> {
  // --- 6. Load real context from the existing systems ---------------------
  const problem = await deps.existingSystems.getProblem(input.problemId);
  if (!problem) throw new ValidationError(`Unknown problem: ${input.problemId}`);
  const submission = await deps.existingSystems.getLatestSubmission(studentId, input.problemId);
  const execution = await deps.existingSystems.getLatestExecutionResult(studentId, input.problemId);

  const studentResponseSignal = classifyStudentResponse(input.studentResponse);
  const lastHint: DeliveredHintRecord | null = state.history.length > 0 ? state.history[state.history.length - 1]! : null;

  const evidence = lastHint
    ? analyzeEvidence({
        executionAtLastHint: state.executionAtLastHint,
        currentExecution: execution,
        codeAtLastHint: state.codeAtLastHint,
        currentCode: submission?.code ?? null,
        hintedLocation: lastHint.codeLocation,
        studentResponse: studentResponseSignal,
      })
    : null;

  // --- 7. Policy decision (deterministic — see policy-engine.ts) ----------
  let decision = decideNextAction({
    mode,
    modeLimits: deps.modeLimits,
    currentLevel: state.currentLevel,
    consecutiveIneffectiveCount: state.consecutiveIneffectiveCount,
    history: state.history,
    lastHint,
    currentExecution: execution,
    evidence,
    action: input.action,
    studentResponse: studentResponseSignal,
  });

  // "Same issue, partial progress" refinement: policy-engine defaults a
  // freshly-recomputed root issue to DIRECTION; if it turns out to be the
  // SAME concept as the previous hint (not a newly uncovered issue), we
  // instead continue one level up from where that concept was left off,
  // per "address the remaining issue" rather than starting over.
  let rootIssue: RootIssueHypothesis | null = state.rootIssue;
  if (decision.freshRootIssue || !rootIssue) {
    const location = locateRelevantCode({
      stackTraceOrCompilerError: execution?.stackTrace ?? execution?.compilerError ?? execution?.runtimeError ?? null,
      code: submission?.code ?? "",
      language: problem.language,
      entryPointHints: problem.entryPointHints,
    });
    rootIssue = buildRootIssueHypothesis({ execution, relevantArea: location.sourceOfTruth === "NONE" ? null : location });

    // "Same issue, needs more precision" vs. "genuinely new issue": the
    // coarse TEACHING_CONCEPT bucket (from root-issue.ts) is a cheap
    // regex-based heuristic and can legitimately reclassify the exact
    // same underlying bug differently once the student's code shape
    // changes (e.g. `len(nums) - 1` -> `range(1, len(nums))` are both
    // still boundary bugs, but only one matches the narrow regex). Concept
    // equality alone is therefore too brittle a signal for continuity.
    // What IS reliably deterministic: whether the failure is still
    // localized to the same function and still the same verdict category
    // (still WRONG_ANSWER, not suddenly a crash) — that's what we use to
    // decide "keep going deeper on this" vs. "treat as a fresh issue".
    const sameFunction =
      lastHint?.codeLocation?.functionName !== undefined &&
      lastHint?.codeLocation?.functionName !== null &&
      lastHint.codeLocation.functionName === rootIssue.relevantArea?.functionName;
    const sameVerdictCategory = lastHint?.executionSnapshotAtDelivery?.verdict === execution?.verdict;
    const likelySameIssue = sameFunction && sameVerdictCategory;

    if (decision.kind === "ACKNOWLEDGE_PROGRESS_AND_CONTINUE" && lastHint && likelySameIssue) {
      const nextLevelIdx = Math.min(ALL_LEVELS.indexOf(lastHint.level) + 1, ALL_LEVELS.length - 1);
      const refinedLevel = ALL_LEVELS[nextLevelIdx]!;
      const ceiling = deps.modeLimits[mode];
      decision = {
        ...decision,
        targetLevel: ALL_LEVELS.indexOf(refinedLevel) > ALL_LEVELS.indexOf(ceiling) ? ceiling : refinedLevel,
        reason: "strong_evidence_same_issue_needs_more_precision",
      };
    }
  }

  // --- 8. Terminal / no-generation-needed decisions ------------------------
  if (decision.kind === "RESOLVED") {
    return await finalize(deps, state, decision, {
      kind: decision.kind,
      hint: null,
      templatedMessage: decision.templatedMessage ?? "The issue appears resolved.",
      denialReason: null,
      requestId: input.requestId,
      statusOverride: "RESOLVED",
      levelOverride: state.currentLevel,
      execution,
      code: submission?.code ?? null,
      rootIssue: state.rootIssue,
      evidence,
      studentResponseSignal,
    });
  }

  if (decision.kind === "HOLD_AND_ENCOURAGE") {
    return await finalize(deps, state, decision, {
      kind: decision.kind,
      hint: null,
      templatedMessage: decision.templatedMessage ?? null,
      denialReason: null,
      requestId: input.requestId,
      statusOverride: state.status,
      levelOverride: state.currentLevel,
      execution,
      code: submission?.code ?? null,
      rootIssue,
      evidence,
      studentResponseSignal,
    });
  }

  if (decision.kind === "DENY_SOLUTION") {
    return await finalize(deps, state, decision, {
      kind: decision.kind,
      hint: null,
      templatedMessage: null,
      denialReason: decision.denialReason ?? "Not available yet.",
      requestId: input.requestId,
      statusOverride: state.status,
      levelOverride: state.currentLevel,
      execution,
      code: submission?.code ?? null,
      rootIssue,
      evidence,
      studentResponseSignal,
    });
  }

  // --- 9. Generation path (DELIVER_FIRST_HINT / ACKNOWLEDGE_PROGRESS_AND_CONTINUE / ESCALATE_STRATEGY / ESCALATE_LEVEL / DELIVER_SOLUTION)
  const promptContext: PromptContext = {
    problem,
    code: submission?.code ?? "",
    language: problem.language,
    rootIssue,
    decision,
    studentFreeText: input.studentResponse?.type === "FREE_TEXT" ? input.studentResponse.value : null,
    studentResponseSignal,
    priorHintTexts: state.history.slice(-3).map((h) => h.text),
    progressNote: decision.templatedMessage ?? null,
  };

  const generation = await generateHint({ router: deps.router, decision, promptContext });

  const hintPayload: HintPayload = {
    hintType: generation.payload.hintType,
    observation: generation.payload.observation,
    text: generation.payload.hint,
    targetArea: generation.payload.targetArea,
    confidence: generation.payload.confidence,
    codeLocation: rootIssue.relevantArea,
    source: generation.source,
  };

  return await finalize(deps, state, decision, {
    kind: decision.kind,
    hint: hintPayload,
    templatedMessage: decision.templatedMessage ?? null,
    denialReason: null,
    requestId: input.requestId,
    statusOverride: state.status,
    levelOverride: decision.targetLevel,
    execution,
    code: submission?.code ?? null,
    rootIssue,
    evidence,
    studentResponseSignal,
    generationMeta: { provider: generation.provider, model: generation.model, latencyMs: generation.latencyMs, violations: generation.violations },
    deliveredConcept: rootIssue.concept,
  });
}

interface FinalizeParams {
  kind: PolicyDecision["kind"];
  hint: HintPayload | null;
  templatedMessage: string | null;
  denialReason: string | null;
  requestId: string;
  statusOverride: HintLadderState["status"];
  levelOverride: AssistanceLevel;
  execution: HintLadderState["executionAtLastHint"];
  code: string | null;
  rootIssue: RootIssueHypothesis | null;
  evidence: ReturnType<typeof analyzeEvidence> | null;
  studentResponseSignal: StudentResponseSignal | null;
  generationMeta?: { provider: string | null; model: string | null; latencyMs: number | null; violations: string[] };
  deliveredConcept?: DeliveredHintRecord["concept"];
}

/** Persists the transition (events + updated session state) and returns the response, caching it under the request id for idempotency. */
async function finalize(deps: HintLadderServiceDeps, state: HintLadderState, decision: PolicyDecision, p: FinalizeParams): Promise<HintResponsePayload> {
  const events: NewHintEventInput[] = [
    {
      eventType: "HINT_REQUESTED",
      assistanceLevel: null,
      hintType: null,
      payload: { reason: decision.reason },
      requestId: p.requestId,
      provider: null,
      model: null,
      latencyMs: null,
    },
  ];

  if (p.evidence && state.history.length > 0) {
    events.push({
      eventType:
        p.evidence.effectiveness === "STRONG" || p.evidence.fullyResolved
          ? "HINT_EFFECTIVE"
          : p.evidence.effectiveness === "NEGATIVE"
          ? "HINT_INEFFECTIVE"
          : "HINT_ATTEMPTED",
      assistanceLevel: state.currentLevel,
      hintType: null,
      payload: { effectiveness: p.evidence.effectiveness, reasoning: p.evidence.reasoning, passCountDelta: p.evidence.passCountDelta },
      requestId: null,
      provider: null,
      model: null,
      latencyMs: null,
    });
  }

  let newHistoryRecord: DeliveredHintRecord | undefined;

  if (p.hint && p.rootIssue) {
    const targetSignature = buildTargetSignature(p.deliveredConcept ?? p.rootIssue.concept, p.hint.targetArea);
    newHistoryRecord = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level: p.levelOverride,
      hintType: p.hint.hintType,
      concept: p.deliveredConcept ?? p.rootIssue.concept,
      targetSignature,
      text: p.hint.text,
      observation: p.hint.observation,
      confidence: p.hint.confidence,
      codeLocation: p.hint.codeLocation,
      createdAt: deps.now(),
      executionSnapshotAtDelivery: p.execution
        ? { verdict: p.execution.verdict, testsPassed: p.execution.testsPassed, testsTotal: p.execution.testsTotal }
        : null,
      studentResponse: p.studentResponseSignal,
      effectiveness: "PENDING",
      source: p.hint.source,
    };
    events.push({
      eventType: "HINT_DELIVERED",
      assistanceLevel: newHistoryRecord.level,
      hintType: newHistoryRecord.hintType,
      payload: { ...newHistoryRecord },
      requestId: null,
      provider: p.generationMeta?.provider ?? null,
      model: p.generationMeta?.model ?? null,
      latencyMs: p.generationMeta?.latencyMs ?? null,
    });
    if (p.generationMeta && p.generationMeta.violations.length > 0) {
      events.push({
        eventType: "HINT_GENERATED",
        assistanceLevel: newHistoryRecord.level,
        hintType: newHistoryRecord.hintType,
        payload: { violations: p.generationMeta.violations },
        requestId: null,
        provider: p.generationMeta.provider,
        model: p.generationMeta.model,
        latencyMs: p.generationMeta.latencyMs,
      });
    }
  }

  if (p.statusOverride === "RESOLVED") {
    events.push({
      eventType: "ISSUE_RESOLVED",
      assistanceLevel: state.currentLevel,
      hintType: null,
      payload: { message: p.templatedMessage },
      requestId: null,
      provider: null,
      model: null,
      latencyMs: null,
    });
  }
  if (decision.kind === "DELIVER_SOLUTION") {
    events.push({
      eventType: "SOLUTION_ASSISTANCE_USED",
      assistanceLevel: "SOLUTION_ASSISTANCE",
      hintType: "SOLUTION_ASSISTANCE",
      payload: {},
      requestId: null,
      provider: null,
      model: null,
      latencyMs: null,
    });
  }

  const consecutiveIneffective =
    p.evidence?.effectiveness === "NEGATIVE"
      ? state.consecutiveIneffectiveCount + 1
      : p.evidence?.effectiveness === "STRONG" || p.evidence?.fullyResolved
      ? 0
      : state.consecutiveIneffectiveCount;

  const transition: ApplyTransitionInput = {
    sessionId: state.sessionId,
    expectedVersion: state.version,
    patch: {
      status: p.statusOverride,
      currentLevel: p.levelOverride,
      consecutiveIneffectiveCount: consecutiveIneffective,
      executionAtLastHint: p.hint ? p.execution : state.executionAtLastHint,
      codeAtLastHint: p.hint ? p.code : state.codeAtLastHint,
      rootIssue: p.rootIssue,
    },
    appendHistory: newHistoryRecord,
    events,
  };

  const updated = await deps.repository.applyTransition(transition);

  const response: HintResponsePayload = {
    sessionId: updated.sessionId,
    status: updated.status,
    currentLevel: updated.currentLevel,
    kind: p.kind,
    hint: p.hint,
    templatedMessage: p.templatedMessage,
    denialReason: p.denialReason,
    offerSolutionOption: decision.offerSolutionOption,
    progression: buildProgression(updated.currentLevel),
  };

  await deps.repository.cacheResponse(state.sessionId, p.requestId, response);
  return response;
}

export async function getHintLadderState(deps: HintLadderServiceDeps, studentId: string | null, problemId: string) {
  if (!studentId) throw new AuthError();
  const state = await deps.repository.getSession({ studentId, problemId });
  if (!state) {
    return { exists: false as const };
  }
  if (state.studentId !== studentId) throw new OwnershipError();
  return {
    exists: true as const,
    sessionId: state.sessionId,
    status: state.status,
    currentLevel: state.currentLevel,
    progression: buildProgression(state.currentLevel),
  };
}

export async function getHintLadderHistory(deps: HintLadderServiceDeps, studentId: string | null, problemId: string) {
  if (!studentId) throw new AuthError();
  const state = await deps.repository.getSession({ studentId, problemId });
  if (!state) return [];
  if (state.studentId !== studentId) throw new OwnershipError();
  return state.history;
}
