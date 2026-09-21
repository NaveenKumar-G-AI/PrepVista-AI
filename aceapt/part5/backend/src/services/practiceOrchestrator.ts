import { randomUUID } from "node:crypto";
import {
  ConfidenceLevel,
  Difficulty,
  MasteryState,
  PracticeMode,
  QuestionType,
  RetryType,
  SessionStatus,
} from "../domain/enums";
import { Attempt, DashboardRecommendation, PracticeSession, Question, SessionSummary } from "../domain/types";
import { SkillRepository, StudentRepository } from "../repositories/catalogRepository";
import { SkillStateRepository } from "../repositories/skillStateRepository";
import { SessionRepository } from "../repositories/sessionRepository";
import { AttemptRepository } from "../repositories/attemptRepository";
import { QuestionRepository } from "../repositories/questionRepository";
import { MasteryRepository } from "../repositories/masteryRepository";
import { planSession } from "../engines/sessionPlanner";
import { rankCandidates, SelectionContext } from "../engines/selectionEngine";
import { decideNextDifficulty } from "../engines/difficultyEngine";
import { applyAdaptation } from "../engines/sessionAdapter";
import { classifyError } from "../engines/errorClassifier";
import { classifyConfidenceCalibration, computeRelativeSpeed, detectFatigue, foldAttemptIntoState, interpretPerformance } from "../engines/signals";
import { detectSuspectedMemorization } from "../engines/antiMemorization";
import { assessMastery } from "../engines/mastery";
import { getNextHint } from "../engines/hintEngine";
import { explainCorrect, explainIncorrect } from "../engines/explanationEngine";
import { decideRetry } from "../engines/retryEngine";
import { fulfillQuestionSpec } from "../generation/pipeline";
import { InMemoryMasteryPathAdapter, InMemorySkillIntelligenceAdapter } from "../adapters/feature34Adapters";
import { AnalyticsService } from "./analyticsService";

// See adapters/feature34Adapters.ts — swap these bindings for real Feature 3/4 clients later.
const skillIntelligence = new InMemorySkillIntelligenceAdapter(() => SkillRepository.all());
const masteryPath = new InMemoryMasteryPathAdapter();

export class SessionNotFoundError extends Error {}
export class SessionNotOwnedError extends Error {}
export class NoQuestionAvailableError extends Error {}

async function assertSession(sessionId: string, studentId: string): Promise<PracticeSession> {
  const session = SessionRepository.get(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  if (session.studentId !== studentId) throw new SessionNotOwnedError(sessionId);
  return session;
}

function planItemTypesRemaining(session: PracticeSession): QuestionType[] {
  const remaining: QuestionType[] = [];
  for (let i = session.planIndex; i < session.plan.length; i++) {
    const item = session.plan[i];
    const alreadyServedForThisItem = i === session.planIndex ? countServedOfCurrentItem(session) : 0;
    for (let c = alreadyServedForThisItem; c < item.count; c++) remaining.push(item.questionType);
  }
  return remaining;
}

function countServedOfCurrentItem(session: PracticeSession): number {
  // Simple running count: how many questions already served belong to the current plan item.
  let served = 0;
  let idx = 0;
  let remainingInItem = session.plan[0]?.count ?? 0;
  for (const _ of session.questionsServed) {
    served++;
    remainingInItem--;
    if (remainingInItem <= 0 && idx < session.planIndex) {
      idx++;
      remainingInItem = session.plan[idx]?.count ?? 0;
      served = 0;
    }
  }
  return served;
}

/** Advances session.planIndex based on how many questions have been served so far. */
function currentPlanQuestionType(session: PracticeSession): QuestionType | null {
  let servedSoFar = session.questionsServed.length;
  for (const item of session.plan) {
    if (servedSoFar < item.count) return item.questionType;
    servedSoFar -= item.count;
  }
  return null; // plan exhausted
}

async function serveNextQuestion(
  session: PracticeSession,
  opts: { retryType?: RetryType } = {}
): Promise<Question | null> {
  const skill = SkillRepository.get(session.skillFocus[0]) ?? SkillRepository.all()[0];
  if (!skill) return null;

  let excludeIds = [...session.questionsServed];
  let targetDifficulty = session.currentDifficulty;
  let questionType = currentPlanQuestionType(session) ?? QuestionType.STANDARD_PRACTICE;

  if (opts.retryType === RetryType.RETRY_SAME || opts.retryType === RetryType.RETRY_WITH_HINT) {
    const lastQuestionId = session.questionsServed[session.questionsServed.length - 1];
    const existing = lastQuestionId ? QuestionRepository.get(lastQuestionId) : null;
    if (existing) {
      session.currentQuestionServedAt = new Date().toISOString();
      session.currentQuestionHintsUsed = 0;
      SessionRepository.save(session);
      return existing;
    }
  }
  if (opts.retryType === RetryType.EASIER_REMEDIATION) {
    targetDifficulty = Math.max(Difficulty.FOUNDATION, session.currentDifficulty - 1) as Difficulty;
    questionType = QuestionType.GUIDED_PRACTICE;
    excludeIds = []; // remediation deliberately allows a previously-seen easier question back in
  }

  const state = SkillStateRepository.getOrCreate(session.studentId, skill.id);

  const poolCandidates = QuestionRepository.findCandidates({ skillId: skill.id, excludeQuestionIds: excludeIds });
  const exposureMap = QuestionRepository.getExposureMap(
    session.studentId,
    poolCandidates.map((q) => q.id)
  );

  const ctx: SelectionContext = {
    targetDifficulty,
    focusDimension: session.currentFocusDimension,
    objective: session.objective,
    preferredQuestionTypes: [questionType],
    suspectedMemorization: state.suspectedMemorization,
    recentSkillIds: [skill.id],
    recentSubtopics: session.questionsServed
      .map((id) => QuestionRepository.get(id)?.subtopic)
      .filter((s): s is string => !!s)
      .slice(-3),
  };

  let chosen: Question | null = null;
  if (poolCandidates.length > 0) {
    const ranked = rankCandidates(poolCandidates, exposureMap, ctx);
    chosen = ranked[0]?.question ?? null;
  }

  if (!chosen) {
    const outcome = await fulfillQuestionSpec(
      {
        skill,
        targetDifficulty,
        focusDimension: session.currentFocusDimension,
        questionType,
        avoidTemplateIds: [],
        reason: `Serving question ${session.questionsServed.length + 1} for objective ${session.objective}`,
      },
      { preferPool: false, allowAI: false, excludeQuestionIds: excludeIds }
    );
    chosen = outcome.question;
  }

  if (!chosen) return null;

  session.questionsServed.push(chosen.id);
  session.currentQuestionServedAt = new Date().toISOString();
  session.currentQuestionHintsUsed = 0;
  SessionRepository.save(session);
  return chosen;
}

export const PracticeOrchestrator = {
  async getDashboard(studentId: string): Promise<DashboardRecommendation> {
    const skills = await skillIntelligence.getSkillCatalog();
    const states = new Map(skills.map((s) => [s.id, SkillStateRepository.getOrCreate(studentId, s.id)]));
    const plan = planSession(skills, states);

    const touchedStates = [...states.values()].filter((s) => s.attemptCount > 0);
    const accuracy = avg(touchedStates.map((s) => s.recentAccuracy)) * 100;
    const speed = avg(
      touchedStates.map((s) => {
        // crude 0-100 "speed score": faster than expected => higher score. We don't have
        // expected time per skill handy here, so approximate via hint usage + accuracy trend instead.
        return clamp01(1 - s.hintUsageRate / 3) * 100;
      })
    );
    const consistency = avg(touchedStates.map((s) => 1 - Math.min(1, errorSpread(s.errorDistribution)))) * 100;

    const recentImprovement = touchedStates.slice(0, 3).map((s) => {
      const skill = skills.find((sk) => sk.id === s.skillId)!;
      const recent = AttemptRepository.recentForSkill(studentId, s.skillId, 8);
      const direction = trendDirection(recent);
      return {
        skillId: s.skillId,
        skillName: skill.name,
        direction,
        note:
          direction === "UP"
            ? `Accuracy trending up on ${skill.name}.`
            : direction === "DOWN"
              ? `Accuracy has dipped recently on ${skill.name}.`
              : `${skill.name} performance is steady.`,
      };
    });

    const active = SessionRepository.findActiveForStudent(studentId);

    return {
      currentGoal: goalLabel(plan.objective, skills.find((s) => s.id === plan.skillFocus[0])?.name ?? "practice"),
      objective: plan.objective,
      reason: plan.objectiveReason,
      recommendedSession: plan.plan,
      accuracy: round1(accuracy || 0),
      speed: round1(speed || 0),
      consistency: round1(consistency || 0),
      recentImprovement,
      nextBestAction: describeNextAction(plan.plan),
      hasActiveSession: !!active,
      activeSessionId: active?.id ?? null,
    };
  },

  async getActiveSession(studentId: string) {
    const session = SessionRepository.findActiveForStudent(studentId);
    if (!session) return null;
    const currentQuestionId = session.questionsServed[session.questionsServed.length - 1];
    const question = currentQuestionId ? QuestionRepository.get(currentQuestionId) : null;
    return { session, question };
  },

  async startSession(studentId: string, requestedMode?: PracticeMode) {
    StudentRepository.ensure(studentId, studentId);
    const existingActive = SessionRepository.findActiveForStudent(studentId);
    if (existingActive) {
      const q = QuestionRepository.get(existingActive.questionsServed[existingActive.questionsServed.length - 1]);
      return { session: existingActive, question: q, resumed: true };
    }

    const skills = await skillIntelligence.getSkillCatalog();
    const states = new Map(skills.map((s) => [s.id, SkillStateRepository.getOrCreate(studentId, s.id)]));
    const plan = planSession(skills, states, requestedMode);

    const session: PracticeSession = {
      id: randomUUID(),
      studentId,
      mode: plan.mode,
      objective: plan.objective,
      objectiveReason: plan.objectiveReason,
      skillFocus: plan.skillFocus,
      plan: plan.plan,
      planIndex: 0,
      questionsServed: [],
      attempts: [],
      currentDifficulty: plan.startingDifficulty,
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      completedAt: null,
      adaptationLog: [],
      currentQuestionServedAt: null,
      currentQuestionHintsUsed: 0,
    };
    SessionRepository.create(session);

    const question = await serveNextQuestion(session);
    if (!question) throw new NoQuestionAvailableError(`No question available for skill(s) ${plan.skillFocus.join(",")}`);

    AnalyticsService.sessionStarted(studentId, { sessionId: session.id, objective: session.objective, mode: session.mode });
    return { session, question, resumed: false };
  },

  async getHint(studentId: string, sessionId: string) {
    const session = await assertSession(sessionId, studentId);
    const questionId = session.questionsServed[session.questionsServed.length - 1];
    const question = QuestionRepository.get(questionId);
    if (!question) throw new NoQuestionAvailableError(questionId);

    const result = getNextHint(question, session.currentQuestionHintsUsed);
    if (result.hint) {
      session.currentQuestionHintsUsed += 1;
      SessionRepository.save(session);
      AnalyticsService.hintUsed(studentId, { sessionId, questionId, level: result.hint.level });
    }
    return result;
  },

  async submitAttempt(
    studentId: string,
    sessionId: string,
    input: { selectedOptionId: string | null; timeToStartMs: number; confidence?: ConfidenceLevel | null }
  ) {
    const session = await assertSession(sessionId, studentId);
    if (session.status !== SessionStatus.IN_PROGRESS) throw new Error("Session is not in progress.");

    const questionId = session.questionsServed[session.questionsServed.length - 1];
    const question = QuestionRepository.get(questionId);
    if (!question) throw new NoQuestionAvailableError(questionId);

    const servedAt = session.currentQuestionServedAt ? new Date(session.currentQuestionServedAt).getTime() : Date.now();
    const totalTimeMs = Math.max(200, Date.now() - servedAt); // server-authoritative — never trust a client-sent duration for scoring (§42)
    const expectedTimeMs = question.expectedTimeSeconds * 1000;

    const isCorrect = question.options.some((o) => o.id === input.selectedOptionId && o.isCorrect);

    const state = SkillStateRepository.getOrCreate(studentId, question.skillId);
    const relativeSpeed = computeRelativeSpeed(totalTimeMs, expectedTimeMs, state.averageTimeSeconds);

    let errorCategory = null as Attempt["errorCategory"];
    let classificationRationale = "";
    if (!isCorrect) {
      const classification = classifyError({
        question,
        selectedOptionId: input.selectedOptionId,
        relativeSpeed,
        totalTimeMs,
        expectedTimeMs,
        hintsUsed: session.currentQuestionHintsUsed,
      });
      errorCategory = classification.category;
      classificationRationale = classification.rationale;
    }

    const { interpretation } = interpretPerformance(isCorrect, relativeSpeed);

    const attempt: Attempt = {
      id: randomUUID(),
      studentId,
      sessionId,
      questionId,
      skillId: question.skillId,
      selectedOptionId: input.selectedOptionId,
      isCorrect,
      timeToStartMs: input.timeToStartMs,
      totalTimeMs,
      expectedTimeMs,
      relativeSpeed,
      hintsUsed: session.currentQuestionHintsUsed,
      confidence: input.confidence ?? null,
      errorCategory,
      performanceInterpretation: interpretation,
      difficultyAtAttempt: question.difficulty,
      questionIndexInSession: session.questionsServed.length,
      createdAt: new Date().toISOString(),
    };
    AttemptRepository.insert(attempt);
    QuestionRepository.recordExposure(studentId, questionId, isCorrect);

    // --- Fold into practice memory (§30) ---
    const folded = foldAttemptIntoState(state, attempt);
    Object.assign(state, folded);
    if (input.confidence) {
      state.confidenceCalibration = classifyConfidenceCalibration(input.confidence, isCorrect);
    }

    const recentHistory = AttemptRepository.recentForSkill(studentId, question.skillId, 6).filter((a) => a.id !== attempt.id);
    // Step from the ACTUAL difficulty of the question just answered, not the
    // previous target — the target can lag behind (or exceed) what the pool
    // actually has available at that skill, and stepping from a phantom
    // target instead of reality causes the served difficulty to drift out of
    // sync with what decideNextDifficulty thinks "current" means.
    const decision = decideNextDifficulty(attempt.difficultyAtAttempt.level, attempt, recentHistory);
    state.currentDifficulty = decision.nextDifficulty;

    // Anti-memorization check (§17) — recompute periodically, not on every single attempt, to keep this cheap.
    if (state.attemptCount % 3 === 0) {
      const recentWithExposure = AttemptRepository.recentForSkill(studentId, question.skillId, 12).map((a) => ({
        exposure: QuestionRepository.getExposure(studentId, a.questionId) ?? undefined,
        question: QuestionRepository.get(a.questionId)!,
        wasCorrect: a.isCorrect,
      }));
      const memCheck = detectSuspectedMemorization(recentWithExposure);
      state.suspectedMemorization = memCheck.suspected;
    }

    // Mastery assessment (§24)
    const recentForMastery = AttemptRepository.recentForSkill(studentId, question.skillId, 15);
    const qTypeMap = new Map(recentForMastery.map((a) => [a.questionId, QuestionRepository.get(a.questionId)?.questionType]).filter(([, t]) => !!t) as [string, QuestionType][]);
    const availableTypes = QuestionRepository.availableQuestionTypesForSkill(question.skillId, [QuestionType.APPLICATION, QuestionType.TRANSFER]);
    const masteryAssessment = assessMastery(state, recentForMastery, qTypeMap, {
      skillHasApplicationContent: availableTypes.has(QuestionType.APPLICATION),
      skillHasTransferContent: availableTypes.has(QuestionType.TRANSFER),
    });
    const previousMasteryState = state.masteryState;
    state.masteryState = masteryAssessment.state;
    SkillStateRepository.save(state);

    if (previousMasteryState !== MasteryState.VERIFIED_MASTERY && masteryAssessment.state === MasteryState.VERIFIED_MASTERY) {
      const record = MasteryRepository.record(studentId, question.skillId, "CONSISTENCY", masteryAssessment.evidence);
      await masteryPath.submitPerformanceEvidence(studentId, [record]);
      AnalyticsService.masteryVerified(studentId, { skillId: question.skillId, evidence: masteryAssessment.evidence });
    }

    // --- Apply real-time adaptation to the session (§20) ---
    const adaptationEvent = applyAdaptation(session, decision, attempt);
    session.attempts.push(attempt.id);
    SessionRepository.save(session);
    if (adaptationEvent) {
      AnalyticsService.adaptationTriggered(studentId, { sessionId, ...adaptationEvent });
    }

    const explanation = isCorrect ? explainCorrect(question) : explainIncorrect(question, { category: errorCategory!, confidence: "MEDIUM", rationale: classificationRationale }, input.selectedOptionId);

    const retrySuggestion = isCorrect
      ? null
      : decideRetry({
          errorCategory,
          hintsUsedOnLastAttempt: attempt.hintsUsed,
          sameQuestionRetryCount: recentHistory.filter((a) => a.questionId === questionId).length,
        });

    const fatigue = detectFatigue(AttemptRepository.forSession(sessionId));

    AnalyticsService.attemptSubmitted(studentId, { sessionId, questionId, isCorrect, errorCategory, relativeSpeed });

    return {
      attempt,
      question,
      isCorrect,
      interpretation,
      explanation,
      adaptationEvent,
      retrySuggestion,
      masteryState: state.masteryState,
      masteryRationale: masteryAssessment.rationale,
      fatigue,
      planExhausted: currentPlanQuestionType(session) === null,
    };
  },

  async advanceSession(studentId: string, sessionId: string, retryType?: RetryType) {
    const session = await assertSession(sessionId, studentId);
    if (session.status !== SessionStatus.IN_PROGRESS) throw new Error("Session is not in progress.");

    if (currentPlanQuestionType(session) === null && retryType !== RetryType.RETRY_SAME && retryType !== RetryType.RETRY_WITH_HINT) {
      return this.completeSession(studentId, sessionId);
    }

    const question = await serveNextQuestion(session, { retryType });
    if (!question) {
      return this.completeSession(studentId, sessionId);
    }
    return { session, question, completed: false as const };
  },

  async completeSession(studentId: string, sessionId: string) {
    const session = await assertSession(sessionId, studentId);
    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date().toISOString();
    SessionRepository.save(session);

    const summary = buildSummary(session);
    AnalyticsService.sessionCompleted(studentId, { ...summary });
    return { session, summary, completed: true as const };
  },

  async getSummary(studentId: string, sessionId: string): Promise<SessionSummary> {
    const session = await assertSession(sessionId, studentId);
    return buildSummary(session);
  },

  async getMasteryOverview(studentId: string) {
    const skills = SkillRepository.all();
    return skills.map((s) => {
      const state = SkillStateRepository.getOrCreate(studentId, s.id);
      return { skill: s, state };
    });
  },
};

function buildSummary(session: PracticeSession): SessionSummary {
  const attempts = AttemptRepository.forSession(session.id);
  const correctCount = attempts.filter((a) => a.isCorrect).length;

  const errorCounts = new Map<string, number>();
  for (const a of attempts) {
    if (a.errorCategory) errorCounts.set(a.errorCategory, (errorCounts.get(a.errorCategory) ?? 0) + 1);
  }
  const mainError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None — strong session";

  const skillIds = [...new Set(attempts.map((a) => a.skillId))];
  const whatImproved: string[] = [];
  const whatRemainsWeak: string[] = [];
  for (const skillId of skillIds) {
    const skill = SkillRepository.get(skillId);
    const state = SkillStateRepository.get(session.studentId, skillId);
    if (!skill || !state) continue;
    if (state.recentAccuracy >= 0.75) whatImproved.push(skill.name);
    else whatRemainsWeak.push(skill.name);
  }

  const avgSpeedScore = attempts.length ? attempts.filter((a) => a.relativeSpeed === "FAST").length / attempts.length : 0;
  const accuracy = attempts.length ? correctCount / attempts.length : 0;

  const lastState = skillIds[0] ? SkillStateRepository.get(session.studentId, skillIds[0]) : null;

  return {
    sessionId: session.id,
    whatImproved: whatImproved.length ? whatImproved : ["Keep going — improvement will show after a few more sessions."],
    whatRemainsWeak: whatRemainsWeak.length ? whatRemainsWeak : ["Nothing flagged — solid session."],
    mainErrorPattern: mainError,
    speedStatus: avgSpeedScore >= 0.5 ? "Fast" : avgSpeedScore >= 0.25 ? "On pace" : "Building fluency",
    accuracyStatus: accuracy >= 0.8 ? "Strong" : accuracy >= 0.5 ? "Developing" : "Needs attention",
    masteryStatus: lastState?.masteryState ?? MasteryState.NOT_STARTED,
    nextBestAction: buildNextActionFromSummary(whatRemainsWeak, mainError),
    totalQuestions: attempts.length,
    correctCount,
    adaptationCount: session.adaptationLog.length,
  };
}

function buildNextActionFromSummary(weak: string[], mainError: string): string {
  if (weak.length === 0) return "Move on to a new skill next session — this one is in good shape.";
  if (mainError === "CALCULATION_ERROR" || mainError === "CARELESS_ERROR") {
    return `A short calculation-accuracy drill on ${weak[0]} before moving on.`;
  }
  if (mainError === "CONCEPT_GAP" || mainError === "PARTIAL_UNDERSTANDING") {
    return `Revisit the core concept behind ${weak[0]}, then retry guided practice.`;
  }
  return `More targeted practice on ${weak[0]}.`;
}

function goalLabel(objective: string, skillName: string): string {
  const verbs: Record<string, string> = {
    BUILD_FOUNDATION: `Build the foundation in ${skillName}`,
    REPAIR_GAP: `Repair the gap in ${skillName}`,
    IMPROVE_ACCURACY: `Improve ${skillName} accuracy`,
    IMPROVE_SPEED: `Build speed in ${skillName}`,
    VERIFY_MASTERY: `Verify mastery of ${skillName}`,
    TRANSFER_SKILL: `Apply ${skillName} in new contexts`,
    PREPARE_FOR_EXAM: `Exam-ready practice on ${skillName}`,
    MAINTAIN_SKILL: `Keep ${skillName} sharp`,
  };
  return verbs[objective] ?? `Practice ${skillName}`;
}

function describeNextAction(plan: { questionType: QuestionType; count: number }[]): string {
  const total = plan.reduce((s, p) => s + p.count, 0);
  const top = [...plan].sort((a, b) => b.count - a.count)[0];
  return `Practice ${total} questions, focused on ${labelForType(top?.questionType)} problems.`;
}

function labelForType(t?: QuestionType): string {
  if (!t) return "mixed";
  return t.replace(/_/g, " ").toLowerCase();
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function errorSpread(dist: Partial<Record<string, number>>): number {
  const values = Object.values(dist).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  const total = values.reduce((s, v) => s + v, 0);
  return total === 0 ? 0 : Math.min(1, total / 10);
}
function trendDirection(attempts: Attempt[]): "UP" | "DOWN" | "FLAT" {
  if (attempts.length < 4) return "FLAT";
  const mid = Math.floor(attempts.length / 2);
  const first = attempts.slice(0, mid).filter((a) => a.isCorrect).length / mid;
  const second = attempts.slice(mid).filter((a) => a.isCorrect).length / (attempts.length - mid);
  if (second - first >= 0.2) return "UP";
  if (first - second >= 0.2) return "DOWN";
  return "FLAT";
}
