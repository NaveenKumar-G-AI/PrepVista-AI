/**
 * API layer — §69 (five operations), §70-71 (idempotency/concurrency), §72-74 (security).
 *
 * This wires the whole pipeline together: decide() -> generate() -> validateHint() -> persist
 * -> analytics. Every route enforces its own auth + ownership; assessment-mode restriction is
 * enforced here at the API boundary (§72: "do not rely only on hiding the frontend button"),
 * not only inside the policy engine, even though decide() would also refuse.
 */

import { randomUUID } from "node:crypto";
import express, { Express, NextFunction, Request, Response } from "express";

import {
  AssessmentMode,
  AttemptSnapshot,
  HintInteraction,
  HintLevel,
  HintOutcome,
  HintOutcomeResultEnum,
  HintPreference,
  MistakeSignal,
  PolicyRequest,
  TriggerType,
} from "../domain/types";
import { decide } from "../policy/hintPolicyEngine";
import { computeDependencyState } from "../policy/dependencyState";
import { DeterministicHintGenerator, HintGenerator } from "../generation/hintGenerator";
import { validateHint } from "../validation/hintValidator";
import { HintInteractionRepository, HintOutcomeRepository, HintPreferenceRepository } from "../persistence/repositories";
import { AnalyticsSink, makeEvent } from "../analytics/analytics";
import { AssessmentConfigService, MasteryService, MistakeIntelligenceService, StudentSessionService } from "../integration/stubs";
import { getTrustedQuestionOrThrow, SAMPLE_QUESTIONS } from "../domain/sampleData";

export interface AppDeps {
  interactionRepo: HintInteractionRepository;
  outcomeRepo: HintOutcomeRepository;
  preferenceRepo: HintPreferenceRepository;
  generator: HintGenerator;
  mistakeIntelligence: MistakeIntelligenceService;
  assessmentConfig: AssessmentConfigService;
  sessionService: StudentSessionService;
  masteryService: MasteryService;
  analytics: AnalyticsSink;
}

// -----------------------------------------------------------------------------------------
// Tiny in-request-scope bookkeeping the real ACEAPT session/attempt store would already own.
// Kept local to the API layer since it's wiring, not policy.
// -----------------------------------------------------------------------------------------
class AttemptHistoryStore {
  private log = new Map<string, MistakeSignal[]>();
  record(sessionId: string, stepId: string, signal: MistakeSignal): void {
    const key = `${sessionId}:${stepId}`;
    this.log.set(key, [...(this.log.get(key) ?? []), signal]);
  }
  countOnStep(sessionId: string, stepId: string): number {
    return (this.log.get(`${sessionId}:${stepId}`) ?? []).length;
  }
  sameErrorStreak(sessionId: string, stepId: string): number {
    const arr = this.log.get(`${sessionId}:${stepId}`) ?? [];
    if (arr.length === 0) return 0;
    const last = arr[arr.length - 1];
    let streak = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i] === last; i--) streak++;
    return streak;
  }
}

// -----------------------------------------------------------------------------------------
// Auth — STUB. Replace entirely with ACEAPT's real session/JWT verification (§73).
// The token here is just a base64'd student id so this project runs standalone.
// -----------------------------------------------------------------------------------------
type AuthedRequest = Request & { studentId?: string };

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "UNAUTHENTICATED" });
    return;
  }
  try {
    const studentId = Buffer.from(header.slice("Bearer ".length), "base64").toString("utf8");
    if (!studentId) throw new Error("empty");
    req.studentId = studentId;
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHENTICATED" });
  }
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  const attemptHistory = new AttemptHistoryStore();
  const inFlight = new Set<string>();

  async function dependencyStateFor(studentId: string, skillId: (typeof SAMPLE_QUESTIONS)[number]["skillId"]) {
    const problemIds = SAMPLE_QUESTIONS.filter((q) => q.skillId === skillId).map((q) => q.problemId);
    const interactions = await deps.interactionRepo.listForStudentSkill(studentId, problemIds);
    const recent = interactions.slice(-8);
    const byStep = new Map<string, number>();
    for (const i of recent) {
      const key = `${i.sessionId}:${i.problemId}:${i.stepId}`;
      byStep.set(key, (byStep.get(key) ?? 0) + 1);
    }
    return computeDependencyState(
      recent.map((i) => i.hintLevel),
      [...byStep.values()].map((c) => c > 1),
    );
  }

  // ---- POST /api/hints/request — §69 requestHint ----------------------------------------
  app.post("/api/hints/request", requireAuth, async (req: AuthedRequest, res: Response) => {
    const studentId = req.studentId!;
    const body = req.body as {
      sessionId: string;
      problemId: string;
      stepId: string;
      trigger: TriggerType;
      attemptRaw?: string;
      timeOnStepMs?: number;
      medianTimeForStepMs?: number;
      requestFullSolution?: boolean;
      explicitConfidenceSelfReport?: PolicyRequest["explicitConfidenceSelfReport"];
    };

    let question;
    try {
      question = getTrustedQuestionOrThrow(body.problemId);
    } catch {
      return res.status(404).json({ error: "UNKNOWN_PROBLEM" });
    }

    const owner = deps.sessionService.getOwner(body.sessionId);
    if (!owner) deps.sessionService.setOwner(body.sessionId, studentId);
    else if (owner !== studentId) return res.status(403).json({ error: "FORBIDDEN" }); // §73

    // §72 — enforced here at the API boundary, not only inside the policy engine.
    const assessmentMode = deps.assessmentConfig.getMode(body.sessionId);
    const hintsPermitted = deps.assessmentConfig.hintsExplicitlyPermitted(body.sessionId);
    if (assessmentMode === AssessmentMode.ASSESSMENT && !hintsPermitted) {
      return res.status(403).json({ error: "HINTS_DISABLED_IN_ASSESSMENT" });
    }

    const lockKey = `${body.sessionId}:${body.stepId}`;
    if (inFlight.has(lockKey)) {
      return res.status(409).json({ error: "HINT_REQUEST_IN_PROGRESS" }); // §71 double-click
    }
    inFlight.add(lockKey);

    try {
      let attempt: AttemptSnapshot | undefined;
      if (body.attemptRaw !== undefined) {
        const mistakeSignal = deps.mistakeIntelligence.classify(body.problemId, body.stepId, body.attemptRaw);
        attempt = { raw: body.attemptRaw, isCorrect: mistakeSignal === MistakeSignal.NONE, mistakeSignal };
        attemptHistory.record(body.sessionId, body.stepId, mistakeSignal);
        deps.sessionService.bumpAttemptContextVersion(body.sessionId, body.stepId); // §70 — new attempt context
      }

      const priorAll = await deps.interactionRepo.listForStep(body.sessionId, body.problemId, body.stepId);
      const priorOutcomesAll = await deps.outcomeRepo.listForInteractions(priorAll.map((h) => h.id));
      const alignedHints: HintInteraction[] = [];
      const alignedOutcomes: HintOutcome[] = [];
      for (const h of priorAll) {
        const o = priorOutcomesAll.find((o) => o.interactionId === h.id);
        if (o) {
          alignedHints.push(h);
          alignedOutcomes.push(o);
        }
      }

      const policyRequest: PolicyRequest = {
        studentId,
        sessionId: body.sessionId,
        problemId: body.problemId,
        stepId: body.stepId,
        skillId: question.skillId,
        difficulty: question.difficulty,
        trigger: body.trigger,
        attempt,
        attemptCountOnStep: attemptHistory.countOnStep(body.sessionId, body.stepId),
        sameErrorStreak: attemptHistory.sameErrorStreak(body.sessionId, body.stepId),
        timeOnStepMs: body.timeOnStepMs ?? 0,
        medianTimeForStepMs: body.medianTimeForStepMs ?? 30_000,
        explicitConfidenceSelfReport: body.explicitConfidenceSelfReport,
        priorHintsThisStep: alignedHints,
        priorOutcomesThisStep: alignedOutcomes,
        dependencyState: await dependencyStateFor(studentId, question.skillId),
        assessmentMode,
        hintsExplicitlyPermittedInAssessment: hintsPermitted,
        requestFullSolution: body.requestFullSolution,
      };

      const decision = decide(policyRequest);
      deps.analytics.emit(
        makeEvent(
          body.trigger === TriggerType.EXPLICIT_REQUEST ? "hint_requested" : "hint_auto_offered",
          { studentId, sessionId: body.sessionId, problemId: body.problemId, stepId: body.stepId },
          { trigger: body.trigger },
        ),
      );

      if (!decision.shouldOffer) {
        return res.json({ shouldOffer: false, denialReason: decision.denialReason, followUp: decision.followUp });
      }

      let generated = await deps.generator.generate({
        decision,
        question,
        studentAttempt: attempt?.raw,
        hintHistoryThisStep: priorAll.map((h) => ({ hintType: h.hintType, hintLevel: h.hintLevel, message: h.message })),
      });

      let validation = validateHint(generated, { question, decision });
      if (!validation.valid) {
        deps.analytics.emit(
          makeEvent(
            "hint_validation_failed",
            { studentId, sessionId: body.sessionId, problemId: body.problemId, stepId: body.stepId },
            { reasons: validation.reasons, source: generated.source },
          ),
        );
        generated = await new DeterministicHintGenerator().generate({
          decision,
          question,
          studentAttempt: attempt?.raw,
          hintHistoryThisStep: [],
        });
        validation = validateHint(generated, { question, decision });
        if (!validation.valid) {
          generated = {
            message: "Take another look at this step, and try again.",
            hintType: decision.hintType,
            hintLevel: decision.hintLevel,
            revealsAnswer: false,
            confidence: "low",
            source: "DETERMINISTIC",
          };
        }
      }

      const interaction: HintInteraction = {
        id: randomUUID(),
        sessionId: body.sessionId,
        studentId,
        problemId: body.problemId,
        stepId: body.stepId,
        attemptContextVersion: deps.sessionService.getAttemptContextVersion(body.sessionId, body.stepId),
        trigger: body.trigger,
        blockType: decision.blockType,
        hintType: decision.hintType,
        hintLevel: decision.hintLevel,
        strategyTag: decision.strategyTag,
        revealsAnswer: decision.revealsAnswer,
        message: generated.message,
        rationale: decision.rationale,
        requestedOrAutomatic: body.trigger === TriggerType.EXPLICIT_REQUEST ? "REQUESTED" : "AUTOMATIC",
        shownAt: new Date().toISOString(),
      };
      await deps.interactionRepo.save(interaction);

      const evtBase = { studentId, sessionId: body.sessionId, problemId: body.problemId, stepId: body.stepId };
      deps.analytics.emit(makeEvent("hint_shown", evtBase, { hintType: interaction.hintType, hintLevel: interaction.hintLevel, source: generated.source }));
      if (interaction.hintLevel >= HintLevel.L6_WORKED_STEP) deps.analytics.emit(makeEvent("hint_solution_revealed", evtBase));
      if (priorAll.length > 0) {
        deps.analytics.emit(makeEvent("hint_escalated", evtBase));
        const last = priorAll[priorAll.length - 1];
        if (last.strategyTag !== interaction.strategyTag) deps.analytics.emit(makeEvent("hint_different_strategy", evtBase));
      }

      return res.json({
        shouldOffer: true,
        interactionId: interaction.id,
        hint: { message: interaction.message, hintType: interaction.hintType, hintLevel: interaction.hintLevel, revealsAnswer: interaction.revealsAnswer },
        rationale: interaction.rationale,
      });
    } finally {
      inFlight.delete(lockKey);
    }
  });

  // ---- POST /api/hints/:id/feedback — §69 submitHintFeedback -----------------------------
  app.post("/api/hints/:id/feedback", requireAuth, async (req: AuthedRequest, res: Response) => {
    const interaction = await deps.interactionRepo.get(req.params.id);
    if (!interaction) return res.status(404).json({ error: "NOT_FOUND" });
    if (interaction.studentId !== req.studentId) return res.status(403).json({ error: "FORBIDDEN" });

    const currentVersion = deps.sessionService.getAttemptContextVersion(interaction.sessionId, interaction.stepId);
    if (interaction.attemptContextVersion !== currentVersion) {
      return res.status(410).json({ error: "STALE_HINT" }); // §71 — step/attempt moved on
    }

    const feedback = (req.body as { feedback: "HELPED" | "STILL_STUCK" }).feedback;
    const result = feedback === "HELPED" ? HintOutcomeResultEnum.SUCCESS : HintOutcomeResultEnum.NO_EFFECT;
    const outcome: HintOutcome = { interactionId: interaction.id, result, recordedAt: new Date().toISOString() };
    await deps.outcomeRepo.save(outcome);
    deps.analytics.emit(
      makeEvent(feedback === "HELPED" ? "hint_helpful" : "hint_ineffective", {
        studentId: interaction.studentId,
        sessionId: interaction.sessionId,
        problemId: interaction.problemId,
        stepId: interaction.stepId,
      }),
    );
    return res.json({ outcome });
  });

  // ---- POST /api/hints/:id/outcome — §69 recordHintOutcome (system-recorded) -------------
  app.post("/api/hints/:id/outcome", requireAuth, async (req: AuthedRequest, res: Response) => {
    const interaction = await deps.interactionRepo.get(req.params.id);
    if (!interaction) return res.status(404).json({ error: "NOT_FOUND" });
    if (interaction.studentId !== req.studentId) return res.status(403).json({ error: "FORBIDDEN" });

    const body = req.body as { result: HintOutcomeResultEnum; timeToRecoveryMs?: number; subsequentIndependence?: boolean };
    const outcome: HintOutcome = {
      interactionId: interaction.id,
      result: body.result,
      timeToRecoveryMs: body.timeToRecoveryMs,
      subsequentIndependence: body.subsequentIndependence,
      recordedAt: new Date().toISOString(),
    };
    await deps.outcomeRepo.save(outcome);

    const evtBase = { studentId: interaction.studentId, sessionId: interaction.sessionId, problemId: interaction.problemId, stepId: interaction.stepId };
    if (body.subsequentIndependence) deps.analytics.emit(makeEvent("independent_after_hint", evtBase));
    if (body.result === HintOutcomeResultEnum.SUCCESS) {
      // §50, §101 — explicitly labelled as assisted evidence, never conflated with independent mastery.
      deps.masteryService.recordAssistedEvidence({
        studentId: interaction.studentId,
        skillId: getTrustedQuestionOrThrow(interaction.problemId).skillId,
        hintLevel: interaction.hintLevel,
      });
    }
    return res.json({ outcome });
  });

  // ---- GET /api/hints/history — §69 getHintHistory (§56 compact, not a huge log) ---------
  app.get("/api/hints/history", requireAuth, async (req: AuthedRequest, res: Response) => {
    const sessionId = String(req.query.sessionId ?? "");
    const owner = deps.sessionService.getOwner(sessionId);
    if (owner && owner !== req.studentId) return res.status(403).json({ error: "FORBIDDEN" }); // §73

    const interactions = await deps.interactionRepo.listForSession(sessionId);
    const outcomes = await deps.outcomeRepo.listForInteractions(interactions.map((i) => i.id));
    const compact = interactions.map((i) => ({
      problemId: i.problemId,
      stepId: i.stepId,
      hintType: i.hintType,
      hintLevel: i.hintLevel,
      outcome: outcomes.find((o) => o.interactionId === i.id)?.result ?? null,
    }));
    return res.json({ history: compact });
  });

  // ---- PUT /api/hints/preference — §69 updateHintPreference (§24-25) ---------------------
  app.put("/api/hints/preference", requireAuth, async (req: AuthedRequest, res: Response) => {
    const body = req.body as Partial<HintPreference>;
    const pref: HintPreference = { studentId: req.studentId!, ...body };
    await deps.preferenceRepo.upsert(pref);
    return res.json({ ok: true });
  });

  app.get("/healthz", (_req, res) => res.json({ ok: true, feature: "48-hint-intelligence" }));

  return app;
}
