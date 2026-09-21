import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { DebuggingRepository } from "../repository/repository.js";
import { NotFoundError } from "../repository/repository.js";
import type { Executor } from "../sandbox/executor.js";
import { AIProviderRouter } from "../ai/providers.js";
import { generateHint } from "../ai/coach.js";
import * as sessionMachine from "../debugging/session.js";
import { buildFingerprint, classifyFailure, determineReproductionStatus } from "../debugging/fingerprint.js";
import {
  createExperiment,
  createHypothesis,
  logAction,
  resolveExperiment,
  resolveHypothesisStatus,
  setHypothesisStatus
} from "../debugging/investigation.js";
import { analyzeMinimalChange, detectOverfitting, evaluateRegression, validateRootCauseChain } from "../debugging/verification.js";
import {
  buildReport,
  buildTimeline,
  computeEfficiencyMetrics,
  computeSkillProfile,
  determineResultStatus,
  type SessionEvidenceBundle
} from "../debugging/skillModel.js";
import { EvidenceRequiredError, InvalidStateTransitionError, type DebuggingResult, type Hypothesis, type RootCauseChain, type TestOutcome } from "../types.js";

export interface AppDeps {
  repository: DebuggingRepository;
  executor: Executor;
  aiRouter: AIProviderRouter;
}

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * INTEGRATION POINT: swap this for CodeForge's real auth/session middleware.
 * This dev stand-in reads `x-user-id` so multiple simulated users are easy
 * to test, and otherwise falls back to a single demo user so the API is
 * usable with zero configuration - matching "leave keys blank, I'll wire it
 * up". Do not ship this to production as-is: it trusts a client-supplied
 * header with no verification.
 */
export function devAuthMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  req.userId = (req.header("x-user-id") || "demo-user").trim();
  next();
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function asyncRoute(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as AuthedRequest, res).catch(next);
  };
}

async function requireOwnedSession(repository: DebuggingRepository, req: AuthedRequest) {
  const id = req.params["id"];
  if (!id) throw new HttpError(400, "Missing session id");
  const found = await repository.getSession(id);
  if (!found) throw new HttpError(404, "Session not found");
  if (found.userId !== req.userId) throw new HttpError(403, "Not your session");
  return found;
}

// ---------------------------------------------------------------------------
// Request schemas - every client input is validated before touching domain
// logic. Malformed input never reaches the sandbox, the repository, or an
// AI prompt un-typed.
// ---------------------------------------------------------------------------

const CreateSessionSchema = z.object({
  challengeId: z.string().min(1),
  submissionId: z.string().nullable().optional(),
  language: z.enum(["python", "javascript"]),
  startingCode: z.string()
});

const ReproduceSchema = z.object({
  input: z.string().default(""),
  expectedOutput: z.string().nullable().default(null),
  isEdgeCase: z.boolean().optional()
});

const ExecuteSchema = z.object({
  code: z.string().optional(),
  stdin: z.string().default(""),
  actionType: z.enum(["RUN", "RUN_SELECTED_TEST", "RUN_FULL_SUITE"]).default("RUN"),
  pythonTrace: z.boolean().optional()
});

const HypothesisCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  suspectedLocation: z.string().max(300).nullable().optional(),
  suspectedCause: z.string().max(1000).nullable().optional(),
  confidence: z.number().min(0).max(100).optional()
});

const HypothesisStatusSchema = z.object({ status: z.enum(["TESTING", "INCONCLUSIVE", "SUPPORTED", "REJECTED"]) });

const ExperimentCreateSchema = z.object({ hypothesisId: z.string().min(1), action: z.string().min(1), expectedResult: z.string().min(1) });

const ExperimentResolveSchema = z.object({ actualResult: z.string().min(1), conclusion: z.enum(["SUPPORTED", "REJECTED", "INCONCLUSIVE"]) });

const EvidenceRefSchema = z.object({
  type: z.enum(["EXECUTION_TRACE", "VARIABLE_STATE", "FAILING_TEST", "CODE_LOCATION", "EXPERIMENT", "BEHAVIOR_COMPARISON"]),
  ref: z.string().min(1)
});

const RootCauseSchema = z.object({
  symptom: z.string().min(1),
  location: z.string().min(1),
  cause: z.string().min(1),
  rootCause: z.string().min(1),
  fix: z.string().nullable().optional(),
  supportingEvidence: z.array(EvidenceRefSchema).default([])
});

const TestCaseSchema = z.object({ id: z.string().min(1), input: z.string(), expectedOutput: z.string() });

const FixSchema = z.object({
  newCode: z.string().min(1),
  originalFailingTest: TestCaseSchema,
  relatedTests: z.array(TestCaseSchema).default([]),
  hiddenTests: z.array(TestCaseSchema).default([]),
  regressionTests: z.array(TestCaseSchema).default([]),
  resourceTests: z.array(TestCaseSchema).default([])
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function buildApp(deps: AppDeps) {
  const { repository, executor, aiRouter } = deps;
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(devAuthMiddleware);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // -- Sessions --------------------------------------------------------------

  app.post(
    "/sessions",
    asyncRoute(async (req, res) => {
      const body = CreateSessionSchema.parse(req.body);
      let s = sessionMachine.createSession({
        id: randomUUID(),
        userId: req.userId!,
        challengeId: body.challengeId,
        submissionId: body.submissionId ?? null,
        language: body.language,
        startingCode: body.startingCode
      });
      s = sessionMachine.applyEvent(s, "START");
      const saved = await repository.createSession(s);
      res.status(201).json(saved);
    })
  );

  app.get(
    "/sessions/:id",
    asyncRoute(async (req, res) => {
      res.json(await requireOwnedSession(repository, req));
    })
  );

  app.get(
    "/sessions/:id/history",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const [fingerprints, hypotheses, experiments, actions, rootCause] = await Promise.all([
        repository.getFingerprintsForSession(s.id),
        repository.getHypothesesForSession(s.id),
        repository.getExperimentsForSession(s.id),
        repository.getActionsForSession(s.id),
        repository.getRootCause(s.id)
      ]);
      res.json({ session: s, fingerprints, hypotheses, experiments, actions, rootCause });
    })
  );

  // -- Reproduction ------------------------------------------------------------

  app.post(
    "/sessions/:id/reproduce",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const body = ReproduceSchema.parse(req.body);

      const run1 = await executor.run({ language: s.language, code: s.currentCode, stdin: body.input, pythonTrace: s.language === "python" });
      const class1 = classifyFailure(run1, body.expectedOutput, { isEdgeCaseInput: body.isEdgeCase });

      const run2 = await executor.run({ language: s.language, code: s.currentCode, stdin: body.input });
      const class2 = classifyFailure(run2, body.expectedOutput, { isEdgeCaseInput: body.isEdgeCase });

      const reproductionStatus = determineReproductionStatus(class1, class2);
      await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "RUN_FAILING_TEST", metadata: { reproductionStatus } }));

      if (!class1) {
        res.json({ reproductionStatus, fingerprint: null, execution: run1 });
        return;
      }

      const fp = buildFingerprint({
        id: randomUUID(),
        sessionId: s.id,
        input: body.input,
        expectedOutput: body.expectedOutput,
        execution: run1,
        runtime: s.language,
        context: { isEdgeCaseInput: body.isEdgeCase }
      });
      if (fp) fp.reproductionStatus = reproductionStatus;
      const saved = fp ? await repository.saveFingerprint(fp) : null;

      res.json({ reproductionStatus, fingerprint: saved, execution: run1, trace: run1.trace ?? null });
    })
  );

  // -- Execution (selected test / full suite / ad hoc run) --------------------

  app.post(
    "/sessions/:id/execute",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const body = ExecuteSchema.parse(req.body);
      const execution = await executor.run({
        language: s.language,
        code: body.code ?? s.currentCode,
        stdin: body.stdin,
        pythonTrace: Boolean(body.pythonTrace) && s.language === "python"
      });
      await repository.logAction(
        logAction({ id: randomUUID(), sessionId: s.id, type: body.actionType, metadata: { exitCode: execution.exitCode, timedOut: execution.timedOut } })
      );
      res.json(execution);
    })
  );

  // -- Hypotheses --------------------------------------------------------------

  app.post(
    "/sessions/:id/hypotheses",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const body = HypothesisCreateSchema.parse(req.body);
      const h = createHypothesis({ id: randomUUID(), sessionId: s.id, ...body });
      const saved = await repository.createHypothesis(h);
      await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "CREATE_HYPOTHESIS", metadata: { hypothesisId: saved.id } }));
      res.status(201).json(saved);
    })
  );

  app.patch(
    "/sessions/:id/hypotheses/:hypothesisId",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const { status } = HypothesisStatusSchema.parse(req.body);
      const hypotheses = await repository.getHypothesesForSession(s.id);
      const h = hypotheses.find((x) => x.id === req.params["hypothesisId"]);
      if (!h) throw new HttpError(404, "Hypothesis not found");

      let updated: Hypothesis;
      if (status === "SUPPORTED" || status === "REJECTED") {
        const experiments = await repository.getExperimentsForSession(s.id);
        updated = resolveHypothesisStatus(h, status, experiments);
        if (status === "REJECTED") {
          await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "REJECT_HYPOTHESIS", metadata: { hypothesisId: h.id } }));
        }
      } else {
        updated = setHypothesisStatus(h, status);
      }
      res.json(await repository.updateHypothesis(updated));
    })
  );

  // -- Experiments ---------------------------------------------------------

  app.post(
    "/sessions/:id/experiments",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const body = ExperimentCreateSchema.parse(req.body);
      const e = createExperiment({ id: randomUUID(), sessionId: s.id, ...body });
      res.status(201).json(await repository.createExperiment(e));
    })
  );

  app.patch(
    "/sessions/:id/experiments/:experimentId",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const body = ExperimentResolveSchema.parse(req.body);
      const experiments = await repository.getExperimentsForSession(s.id);
      const e = experiments.find((x) => x.id === req.params["experimentId"]);
      if (!e) throw new HttpError(404, "Experiment not found");
      const updated = resolveExperiment(e, body.actualResult, body.conclusion);
      res.json(await repository.updateExperiment(updated));
    })
  );

  // -- Hints -----------------------------------------------------------------

  app.post(
    "/sessions/:id/hints",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const [fingerprints, hypotheses, actions] = await Promise.all([
        repository.getFingerprintsForSession(s.id),
        repository.getHypothesesForSession(s.id),
        repository.getActionsForSession(s.id)
      ]);
      const latestFp = fingerprints[fingerprints.length - 1] ?? null;
      const hintsSoFar = actions.filter((a) => a.type === "REQUEST_HINT").length;

      const hint = await generateHint(aiRouter, {
        failureType: latestFp?.failureType ?? "UNKNOWN",
        sourceLocation: latestFp?.sourceLocation
          ? `${latestFp.sourceLocation.function ?? "?"} (${latestFp.sourceLocation.file ?? "?"}:${latestFp.sourceLocation.line ?? "?"})`
          : null,
        errorMessage: latestFp?.errorMessage ?? null,
        studentHypotheses: hypotheses.map((h) => h.text),
        studentNotes: null,
        hintsRequestedSoFar: hintsSoFar
      });

      await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "REQUEST_HINT", metadata: { rung: hint.rung, source: hint.source } }));
      res.json(hint);
    })
  );

  // -- Root cause --------------------------------------------------------------

  app.post(
    "/sessions/:id/root-cause",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const chain = RootCauseSchema.parse(req.body) as RootCauseChain;
      const validation = validateRootCauseChain(chain);
      if (!validation.valid) {
        res.status(422).json({ valid: false, errors: validation.errors });
        return;
      }
      await repository.saveRootCause(s.id, chain);
      if (s.state === "IN_PROGRESS") {
        const updated = sessionMachine.applyEvent(s, "IDENTIFY_ROOT_CAUSE");
        await repository.updateSession(updated);
      }
      await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "ROOT_CAUSE_IDENTIFIED", metadata: {} }));
      res.json({ valid: true, rootCause: chain });
    })
  );

  // -- Fix + regression verification -------------------------------------------

  app.post(
    "/sessions/:id/fix",
    asyncRoute(async (req, res) => {
      let s = await requireOwnedSession(repository, req);
      const body = FixSchema.parse(req.body);
      if (s.state === "IN_PROGRESS") throw new HttpError(409, "Identify a root cause before submitting a fix.");

      const previousCode = s.currentCode;
      s = sessionMachine.applyEvent({ ...s, currentCode: body.newCode }, "ATTEMPT_FIX");
      await repository.updateSession(s);
      await repository.logAction(logAction({ id: randomUUID(), sessionId: s.id, type: "SUBMIT_FIX", metadata: {} }));

      const language = s.language;
      async function runAll(tests: Array<z.infer<typeof TestCaseSchema>>, visible: boolean): Promise<TestOutcome[]> {
        return Promise.all(
          tests.map(async (t) => {
            const r = await executor.run({ language, code: body.newCode, stdin: t.input });
            const outcome: TestOutcome = {
              testId: t.id,
              visible,
              passed: classifyFailure(r, t.expectedOutput) === null,
              input: t.input,
              expected: t.expectedOutput,
              actual: r.stdout,
              durationMs: r.durationMs
            };
            return outcome;
          })
        );
      }

      const [originalOutcome, related, hidden, regressionTests, resource] = await Promise.all([
        runAll([body.originalFailingTest], true).then((r) => r[0]!),
        runAll(body.relatedTests, true),
        runAll(body.hiddenTests, false),
        runAll(body.regressionTests, false),
        runAll(body.resourceTests, false)
      ]);

      const regression = evaluateRegression({
        originalFailureOutcome: originalOutcome,
        relatedTests: related,
        hiddenTests: hidden,
        regressionTests,
        resourceTests: resource
      });
      const overfitting = detectOverfitting({ visibleTests: [originalOutcome, ...related], hiddenTests: hidden });

      s = sessionMachine.applyEvent(s, regression.overallPass ? "VERIFY_SUCCESS" : "VERIFY_FAILURE");
      await repository.updateSession(s);
      await repository.logAction(
        logAction({ id: randomUUID(), sessionId: s.id, type: "RUN_FULL_SUITE", metadata: { overallPass: regression.overallPass } })
      );

      const rootCause = await repository.getRootCause(s.id);
      const minimalChange = analyzeMinimalChange(previousCode, body.newCode, rootCause?.location ?? null);
      await repository.saveFixVerification(s.id, regression, overfitting);

      res.json({ session: s, regression, overfitting, minimalChange });
    })
  );

  // -- Result / skill profile --------------------------------------------------

  app.get(
    "/sessions/:id/result",
    asyncRoute(async (req, res) => {
      const s = await requireOwnedSession(repository, req);
      const [fingerprints, hypotheses, experiments, actions, rootCause, fixVerification] = await Promise.all([
        repository.getFingerprintsForSession(s.id),
        repository.getHypothesesForSession(s.id),
        repository.getExperimentsForSession(s.id),
        repository.getActionsForSession(s.id),
        repository.getRootCause(s.id),
        repository.getFixVerification(s.id)
      ]);

      const latestFp = fingerprints[fingerprints.length - 1] ?? null;
      const rootCauseValidation = rootCause ? validateRootCauseChain(rootCause) : null;
      const fixAction = actions.find((a) => a.type === "SUBMIT_FIX") ?? null;
      const regressionAction = actions.find((a) => a.type === "RUN_FULL_SUITE") ?? null;
      const rootCauseAction = actions.find((a) => a.type === "ROOT_CAUSE_IDENTIFIED") ?? null;

      const bundle: SessionEvidenceBundle = {
        session: s,
        fingerprint: latestFp,
        reproductionAttempts: fingerprints.length,
        reproduced: latestFp?.reproductionStatus === "REPRODUCED",
        hypotheses,
        experiments,
        actions,
        rootCause,
        rootCauseValidation,
        regression: fixVerification.regression,
        overfitting: fixVerification.overfitting,
        hintsUsed: actions.filter((a) => a.type === "REQUEST_HINT").length,
        timestamps: {
          failureObservedAt: latestFp?.capturedAt ?? null,
          firstHypothesisAt: hypotheses[0]?.createdAt ?? null,
          rootCauseIdentifiedAt: rootCauseAction?.createdAt ?? null,
          fixSubmittedAt: fixAction?.createdAt ?? null,
          regressionVerifiedAt: regressionAction?.createdAt ?? null
        }
      };

      const metrics = computeEfficiencyMetrics(bundle);
      const dimensions = computeSkillProfile(bundle, metrics);
      const status = determineResultStatus(dimensions);
      const timeline = buildTimeline(bundle);
      const report = buildReport(bundle, dimensions);

      const result: DebuggingResult = {
        sessionId: s.id,
        status,
        dimensions,
        rootCause,
        regression: bundle.regression,
        overfitting: bundle.overfitting,
        report,
        timeline,
        generatedAt: new Date().toISOString()
      };
      await repository.saveResult(result);
      res.json(result);
    })
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return void res.status(400).json({ error: "validation_failed", details: err.issues });
    if (err instanceof InvalidStateTransitionError) return void res.status(409).json({ error: err.message });
    if (err instanceof EvidenceRequiredError) return void res.status(422).json({ error: err.message });
    if (err instanceof NotFoundError) return void res.status(404).json({ error: err.message });
    // eslint-disable-next-line no-console
    console.error("[debugging-mode] unhandled error", err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
