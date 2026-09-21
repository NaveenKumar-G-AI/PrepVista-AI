import { randomUUID } from "node:crypto";
import { getTeachBackSecondOpinion, getTutorMessage } from "../ai/client";
import { AiOutputContract } from "../ai/outputValidator";
import { logEvent } from "../analytics/events";
import { IntegrationBundle } from "../integrations";
import { SocraticRepository } from "../repositories/socraticRepository";
import { buildCompletionSummary } from "./completionSummary";
import { buildHint } from "./hintEscalation";
import { currentPrompt as misconceptionPrompt, evaluateStep, startExperiment } from "./misconceptionLab";
import {
  generateChangeAmountProblem,
  generatePercentageProblem,
  generateSimplifiedVariant,
  PERCENTAGE_BASE_VALUE_OBJECTIVE,
} from "./questionBank";
import { classifyDeterministic, classifyReasoningElicitation, KNOWN_MISCONCEPTIONS } from "./responseClassifier";
import { evaluateTeachBack } from "./teachBack";
import { applyClassification, decide, resetTurnCounterIfChanged } from "./teachingPolicy";
import {
  HelpLevel,
  MisconceptionExperimentState,
  ProblemContext,
  ResponseClassification,
  SocraticSession,
  SocraticTurn,
  StudentThinkingState,
  TeachingState,
} from "./types";

export class SessionNotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ConcurrentModificationError extends Error {}
export class SessionNotActiveError extends Error {}

function nowIso(): string {
  return new Date().toISOString();
}

const WHY_THIS_QUESTION: Record<string, string> = {
  PRESENT_PROBLEM: "Starting with the problem itself, to see how you approach it before I say anything.",
  IDENTIFY_REFERENCE_VALUE:
    "I'm checking whether the difficulty is choosing the correct base value rather than doing the calculation.",
  ELICIT_REASONING:
    "You got the number right - I want to see the reasoning behind it, since a correct answer alone doesn't tell me you understood it.",
  MISCONCEPTION_EXPERIMENT: "We're testing your idea against a concrete example to see if it holds up.",
  HINT: "A small nudge, without giving away the method.",
  EXPLAIN: "You asked for the explanation directly, so here it is, followed by a quick check.",
  TEACH_BACK: "Explaining it back is the best test of whether an idea has really landed.",
  INDEPENDENT_ATTEMPT: "Same idea, no hints this time, to see if it has really landed.",
  TRANSFER_VERIFICATION: "Different numbers and a different setting, same underlying idea - that's what shows real transfer.",
};

export interface RespondOutcome {
  session: SocraticSession;
  tutorTurn: SocraticTurn;
}

export class SessionEngine {
  constructor(private repo: SocraticRepository, private integrations: IntegrationBundle) {}

  // -- helpers -----------------------------------------------------------

  private async loadOwned(sessionId: string, studentId: string): Promise<SocraticSession> {
    const session = await this.repo.getSession(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.studentId !== studentId) throw new ForbiddenError("session_owned_by_another_student");
    return session;
  }

  private freshThinkingState(): StudentThinkingState {
    return {
      objective: PERCENTAGE_BASE_VALUE_OBJECTIVE.objective,
      targetSkill: PERCENTAGE_BASE_VALUE_OBJECTIVE.targetSkill,
      currentStep: "present_problem",
      understandingState: "not_understood",
      responseState: null,
      misconception: null,
      hintLevel: 0,
      consecutiveHints: 0,
      consecutiveIncorrect: 0,
      independence: "not_yet",
      confidenceSelfReport: null,
      turnsInCurrentState: 0,
      totalTurns: 0,
      achievedCriteria: [],
      usedHintThisProblem: false,
    };
  }

  private async pushTurn(sessionId: string, speaker: "tutor" | "student", content: string, extra: Partial<SocraticTurn> = {}): Promise<SocraticTurn> {
    const existing = await this.repo.listTurns(sessionId);
    const turn: SocraticTurn = {
      id: randomUUID(),
      sessionId,
      sequence: existing.length + 1,
      speaker,
      content,
      createdAt: nowIso(),
      ...extra,
    };
    await this.repo.appendTurn(turn);
    return turn;
  }

  /** Renders a deterministic base message, optionally polished by the AI
   *  layer. Falls back to the base message untouched if AI is unavailable,
   *  disabled, or returns anything that fails validation (section 93). */
  private async render(
    session: SocraticSession,
    action: AiOutputContract["action"],
    baseMessage: string,
    intent: string,
    helpLevel: HelpLevel
  ): Promise<string> {
    const ai = await getTutorMessage({
      action,
      baseMessage,
      intent,
      skill: session.problemContext.skill,
      helpLevel,
    });
    return ai?.message?.trim() || baseMessage;
  }

  private numberVar(problem: ProblemContext, key: string): number {
    const v = problem.variables[key];
    return typeof v === "number" ? v : Number(v) || 0;
  }

  // -- public API ----------------------------------------------------------

  async startSession(studentId: string): Promise<RespondOutcome> {
    const problem = generatePercentageProblem();
    await this.integrations.skillGraph.getStudentSkillState(studentId, PERCENTAGE_BASE_VALUE_OBJECTIVE.targetSkill).catch(() => null);

    const session: SocraticSession = {
      id: randomUUID(),
      studentId,
      objective: PERCENTAGE_BASE_VALUE_OBJECTIVE,
      state: "IDENTIFICATION",
      thinkingState: this.freshThinkingState(),
      problemContext: problem,
      status: "active",
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.repo.createSession(session);

    const message = await this.render(session, "ASK", problem.prompt, "PRESENT_PROBLEM", 0);
    const tutorTurn = await this.pushTurn(session.id, "tutor", message, {
      intent: "PRESENT_PROBLEM",
      targetSkill: problem.skill,
      targetStep: "present_problem",
      helpLevel: 0,
      whyThisQuestion: WHY_THIS_QUESTION.PRESENT_PROBLEM,
    });

    logEvent("socratic_session_started", { studentId, sessionId: session.id, skill: PERCENTAGE_BASE_VALUE_OBJECTIVE.targetSkill });
    return { session, tutorTurn };
  }

  async getSession(sessionId: string, studentId: string): Promise<{ session: SocraticSession; turns: SocraticTurn[] }> {
    const session = await this.loadOwned(sessionId, studentId);
    const turns = await this.repo.listTurns(sessionId);
    return { session, turns };
  }

  async respond(sessionId: string, studentId: string, text: string): Promise<RespondOutcome> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status !== "active") throw new SessionNotActiveError(session.status);

    await this.pushTurn(sessionId, "student", text);

    let classification: ResponseClassification;
    let misconceptionAdvance: MisconceptionExperimentState | undefined;
    let teachBackAchieved: string[] = [];

    if (session.state === "MISCONCEPTION_CHECK" && session.misconceptionState) {
      const evalResult = evaluateStep(session.misconceptionState, text);
      misconceptionAdvance = evalResult.advance;
      classification = evalResult.resolved ? "CORRECT_REASONING" : evalResult.correct ? "PARTIALLY_CORRECT" : "INCORRECT";
    } else if (session.state === "PARTIAL_EXPLANATION" || session.state === "TEACH_BACK") {
      const tb = evaluateTeachBack(text, session.objective.successCriteria);
      const aiAdds = await getTeachBackSecondOpinion({ studentText: text, unmetCriteria: tb.missing });
      const finalMet = { ...tb.criteriaMet };
      for (const c of aiAdds) finalMet[c] = true;
      teachBackAchieved = Object.entries(finalMet)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const allMet = session.objective.successCriteria.every((c) => finalMet[c]);
      classification = allMet ? "CORRECT_REASONING" : "PARTIALLY_CORRECT";
    } else {
      const base = this.numberVar(session.problemContext, "base");
      const misconceptionHit = KNOWN_MISCONCEPTIONS.find(
        (m) => m.skill === session.problemContext.skill && m.test(text)
      );
      if (misconceptionHit) {
        classification = "MISCONCEPTION";
      } else if (session.state === "GUIDED_REASONING") {
        // Eliciting *why* an answer was right is graded on the explanation
        // itself, not against the final numeric answer (section 23-26).
        classification = classifyReasoningElicitation(text, base).classification;
      } else {
        const result = classifyDeterministic({
          text,
          trustedAnswer: session.problemContext.trustedAnswer,
          referenceKeywords: [String(base), "original", "starting"],
          wrongReferenceKeywords: [String(session.problemContext.variables.newValue ?? "")],
          skill: session.problemContext.skill,
        });
        classification = result.classification;
      }
      if (classification === "CORRECT_REASONING") {
        teachBackAchieved = ["identifies_original_value", "selects_correct_reference"];
      }
    }

    const updatedThinking = applyClassification(session.thinkingState, classification, session.state);
    if (teachBackAchieved.length) {
      updatedThinking.achievedCriteria = Array.from(new Set([...updatedThinking.achievedCriteria, ...teachBackAchieved]));
    }

    let policy = decide(session.state, updatedThinking, classification, null);
    // CHECKPOINT is a deliberate instant pass-through (see stateMachine.ts) -
    // it always resolves to INDEPENDENT_ATTEMPT and must never be the state
    // we persist as "waiting on the student".
    while (policy.nextState === "CHECKPOINT") {
      policy = decide(policy.nextState, updatedThinking, classification, null);
    }

    let misconceptionState = session.misconceptionState;
    if (policy.nextState === "MISCONCEPTION_CHECK") {
      misconceptionState = misconceptionAdvance ?? startExperiment(this.numberVar(session.problemContext, "percent") || 20);
    } else {
      misconceptionState = undefined;
    }

    const content = await this.buildContentForState(session, policy.nextState, updatedThinking, misconceptionState);
    const carriedThinking = resetTurnCounterIfChanged(updatedThinking, session.state, policy.nextState);
    if (content.newProblemContext) carriedThinking.usedHintThisProblem = false;

    let newSession: SocraticSession = {
      ...session,
      state: policy.nextState,
      thinkingState: carriedThinking,
      misconceptionState,
      problemContext: content.newProblemContext ?? session.problemContext,
      updatedAt: nowIso(),
    };

    if (policy.nextState === "COMPLETED") {
      newSession = { ...newSession, status: "completed", completionSummary: buildCompletionSummary(newSession) };
      await this.handoffOnCompletion(newSession);
    }
    if (policy.nextState === "ESCALATED") {
      newSession = { ...newSession, status: "escalated" };
    }
    if (classification === "MISCONCEPTION") {
      await this.integrations.mistakeIntelligence.reportMistake({
        studentId,
        skill: session.problemContext.skill,
        signal: "misconception_detected:percentage_increase_decrease_cancel",
        occurrences: 1,
      });
    }

    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();

    const tutorTurn = await this.pushTurn(sessionId, "tutor", content.message, {
      intent: content.intent,
      targetSkill: newSession.problemContext.skill,
      targetStep: content.targetStep,
      helpLevel: content.helpLevel,
      responseClassification: classification,
      whyThisQuestion: content.whyThisQuestion,
    });

    logEvent("socratic_prompt_answered", { studentId, sessionId, classification, nextState: policy.nextState });
    if (policy.nextState === "COMPLETED") logEvent("socratic_completed", { studentId, sessionId });

    return { session: newSession, tutorTurn };
  }

  async requestHint(sessionId: string, studentId: string): Promise<RespondOutcome> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status !== "active") throw new SessionNotActiveError(session.status);

    const consecutiveHints = session.thinkingState.consecutiveHints + 1;

    // Anti-dependency guard (section 36): three hint requests in a row with
    // no intervening attempt gets a "think first" prompt instead of hint 3.
    // This intentionally never calls the general transition()/decide() path -
    // "give me a hint" must not be able to smuggle in a state jump based on
    // whatever classification happens to be sitting on the session.
    if (consecutiveHints >= 3) {
      const thinking: StudentThinkingState = { ...session.thinkingState, consecutiveHints: 0 };
      const message = await this.render(
        session,
        "ASK",
        "Before another hint, tell me: which two quantities in this problem do you think are connected?",
        "ANTI_DEPENDENCY",
        thinking.hintLevel
      );
      const newSession: SocraticSession = {
        ...session,
        state: "GUIDED_REASONING",
        thinkingState: resetTurnCounterIfChanged(thinking, session.state, "GUIDED_REASONING"),
        updatedAt: nowIso(),
      };
      const ok = await this.repo.updateSession(newSession, session.version);
      if (!ok) throw new ConcurrentModificationError();
      const tutorTurn = await this.pushTurn(sessionId, "tutor", message, {
        intent: "ANTI_DEPENDENCY",
        targetSkill: newSession.problemContext.skill,
        targetStep: "think_first",
        helpLevel: thinking.hintLevel,
      });
      logEvent("socratic_hint_requested", { studentId, sessionId, antiDependency: true });
      return { session: newSession, tutorTurn };
    }

    const level = Math.min(6, session.thinkingState.hintLevel + 1) as HelpLevel;
    const thinking: StudentThinkingState = { ...session.thinkingState, consecutiveHints, hintLevel: level, usedHintThisProblem: true };
    const content = await this.buildContentForState(session, "HINT", thinking, undefined);
    const carried = resetTurnCounterIfChanged(thinking, session.state, "HINT");

    const newSession: SocraticSession = {
      ...session,
      state: "HINT",
      thinkingState: carried,
      updatedAt: nowIso(),
    };
    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();

    const tutorTurn = await this.pushTurn(sessionId, "tutor", content.message, {
      intent: content.intent,
      targetSkill: newSession.problemContext.skill,
      targetStep: content.targetStep,
      helpLevel: content.helpLevel,
      whyThisQuestion: content.whyThisQuestion,
    });
    logEvent("socratic_hint_requested", { studentId, sessionId, level });
    return { session: newSession, tutorTurn };
  }

  async requestExplanation(sessionId: string, studentId: string): Promise<RespondOutcome> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status !== "active") throw new SessionNotActiveError(session.status);

    const policy = decide(session.state, session.thinkingState, session.thinkingState.responseState ?? "UNSURE", "explain_directly");
    const content = await this.buildContentForState(session, policy.nextState, session.thinkingState, undefined);
    const carried = resetTurnCounterIfChanged(session.thinkingState, session.state, policy.nextState);

    const newSession: SocraticSession = { ...session, state: policy.nextState, thinkingState: carried, misconceptionState: undefined, updatedAt: nowIso() };
    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();

    const tutorTurn = await this.pushTurn(sessionId, "tutor", content.message, {
      intent: content.intent,
      targetSkill: newSession.problemContext.skill,
      targetStep: content.targetStep,
      helpLevel: content.helpLevel,
      whyThisQuestion: content.whyThisQuestion,
    });
    logEvent("socratic_explanation_requested", { studentId, sessionId });
    return { session: newSession, tutorTurn };
  }

  async requestIndependent(sessionId: string, studentId: string): Promise<RespondOutcome> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status !== "active") throw new SessionNotActiveError(session.status);
    const policy = decide(session.state, session.thinkingState, session.thinkingState.responseState ?? "UNSURE", "solve_independently");
    const content = await this.buildContentForState(session, policy.nextState, session.thinkingState, undefined);
    const carried = resetTurnCounterIfChanged(session.thinkingState, session.state, policy.nextState);
    const newSession: SocraticSession = {
      ...session,
      state: policy.nextState,
      thinkingState: carried,
      misconceptionState: undefined,
      problemContext: content.newProblemContext ?? session.problemContext,
      updatedAt: nowIso(),
    };
    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();
    const tutorTurn = await this.pushTurn(sessionId, "tutor", content.message, {
      intent: content.intent,
      targetSkill: newSession.problemContext.skill,
      targetStep: content.targetStep,
      helpLevel: content.helpLevel,
      whyThisQuestion: content.whyThisQuestion,
    });
    return { session: newSession, tutorTurn };
  }

  async requestSimplify(sessionId: string, studentId: string): Promise<RespondOutcome> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status !== "active") throw new SessionNotActiveError(session.status);
    const simplified = generateSimplifiedVariant(session.problemContext);
    const message = await this.render(session, "SIMPLIFY", simplified.prompt, "SIMPLIFY", session.thinkingState.hintLevel);
    const newSession: SocraticSession = { ...session, problemContext: simplified, updatedAt: nowIso() };
    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();
    const tutorTurn = await this.pushTurn(sessionId, "tutor", message, {
      intent: "SIMPLIFY",
      targetSkill: simplified.skill,
      targetStep: "simplified_restart",
      helpLevel: session.thinkingState.hintLevel,
    });
    return { session: newSession, tutorTurn };
  }

  async requestNewQuestion(studentId: string): Promise<RespondOutcome> {
    return this.startSession(studentId);
  }

  async complete(sessionId: string, studentId: string): Promise<SocraticSession> {
    const session = await this.loadOwned(sessionId, studentId);
    if (session.status === "completed" || session.status === "escalated") return session;
    const newSession: SocraticSession = {
      ...session,
      status: "abandoned",
      completionSummary: buildCompletionSummary(session),
      updatedAt: nowIso(),
    };
    const ok = await this.repo.updateSession(newSession, session.version);
    if (!ok) throw new ConcurrentModificationError();
    logEvent("socratic_abandoned", { studentId, sessionId });
    return newSession;
  }

  private async handoffOnCompletion(session: SocraticSession): Promise<void> {
    const reasoningQuality = session.thinkingState.usedHintThisProblem ? "partial" : "strong";
    await this.integrations.mastery.submitEvidence({
      studentId: session.studentId,
      skill: session.objective.targetSkill,
      independentSuccess: true,
      reasoningQuality,
      verificationSuccess: true,
    });
    await this.integrations.dailyMission.notifySessionCompleted({ studentId: session.studentId, skill: session.objective.targetSkill });
  }

  // -- content builder -------------------------------------------------

  private async buildContentForState(
    session: SocraticSession,
    nextState: TeachingState,
    thinking: StudentThinkingState,
    misconceptionState: MisconceptionExperimentState | undefined
  ): Promise<{
    message: string;
    intent: string;
    targetStep: string;
    helpLevel: HelpLevel;
    whyThisQuestion?: string;
    newProblemContext?: ProblemContext;
  }> {
    const base = this.numberVar(session.problemContext, "base");
    const percent = this.numberVar(session.problemContext, "percent");
    const changeAmount = this.numberVar(session.problemContext, "changeAmount");
    const contextNoun = String(session.problemContext.variables.contextNoun ?? "value");

    switch (nextState) {
      case "MISCONCEPTION_CHECK": {
        const prompt = misconceptionPrompt(misconceptionState!);
        return {
          message: await this.render(session, "ASK", prompt, "MISCONCEPTION_EXPERIMENT", 0),
          intent: "MISCONCEPTION_EXPERIMENT",
          targetStep: `misconception_step_${misconceptionState!.step}`,
          helpLevel: 0,
          whyThisQuestion: WHY_THIS_QUESTION.MISCONCEPTION_EXPERIMENT,
        };
      }

      case "GUIDED_REASONING": {
        const followedWrongAnswer = thinking.responseState === "INCORRECT" || thinking.responseState === "NO_RESPONSE" || thinking.responseState === "UNSURE";
        const q = followedWrongAnswer
          ? "Let's go back a step. Which number in the problem is the value you started with, before anything changed?"
          : "What did you do with the original value to get that result?";
        return {
          message: await this.render(session, "ASK", q, "ELICIT_REASONING", thinking.hintLevel),
          intent: "ELICIT_REASONING",
          targetStep: "elicit_reasoning",
          helpLevel: thinking.hintLevel,
          whyThisQuestion: WHY_THIS_QUESTION.ELICIT_REASONING,
        };
      }

      case "HINT": {
        const level = (Math.max(1, thinking.hintLevel) || 1) as HelpLevel;
        const hint = buildHint(level, { base, percent, changeAmount, contextNoun });
        return {
          message: await this.render(session, "HINT", `Hint ${level}: ${hint}`, "HINT", level),
          intent: "HINT",
          targetStep: "hint",
          helpLevel: level,
          whyThisQuestion: WHY_THIS_QUESTION.HINT,
        };
      }

      case "PARTIAL_EXPLANATION": {
        const why = "Percentage change is measured against the value you started with, not the new one.";
        const how = "Divide the amount of change by the original value, then convert that to a percentage.";
        const example = `Change = ${changeAmount}. ${changeAmount} ÷ ${base} × 100 = ${((changeAmount / (base || 1)) * 100).toFixed(1)}%.`;
        const tryIt = "Now explain it back in your own words: why do we divide by the original value, not the new one?";
        const message = `${why} ${how}\n\nExample: ${example}\n\n${tryIt}`;
        return {
          message: await this.render(session, "EXPLAIN", message, "EXPLAIN", 6),
          intent: "EXPLAIN",
          targetStep: "direct_explanation",
          helpLevel: 6,
          whyThisQuestion: WHY_THIS_QUESTION.EXPLAIN,
        };
      }

      case "TEACH_BACK": {
        const q = "One more check: explain in one sentence why the original value was the base, not the new one.";
        return {
          message: await this.render(session, "REFLECT", q, "TEACH_BACK", 0),
          intent: "TEACH_BACK",
          targetStep: "final_teach_back",
          helpLevel: 0,
          whyThisQuestion: WHY_THIS_QUESTION.TEACH_BACK,
        };
      }

      case "INDEPENDENT_ATTEMPT": {
        const newProblem = generateChangeAmountProblem(Math.random, session.problemContext);
        const message = `Now try this one without any help: ${newProblem.prompt}`;
        return {
          message: await this.render(session, "VERIFY", message, "INDEPENDENT_ATTEMPT", 0),
          intent: "INDEPENDENT_ATTEMPT",
          targetStep: "independent_attempt",
          helpLevel: 0,
          whyThisQuestion: WHY_THIS_QUESTION.INDEPENDENT_ATTEMPT,
          newProblemContext: newProblem,
        };
      }

      case "TRANSFER_VERIFICATION": {
        const newProblem = generatePercentageProblem(Math.random, session.problemContext);
        const message = `One more, in a different setting: ${newProblem.prompt}`;
        return {
          message: await this.render(session, "VERIFY", message, "TRANSFER_VERIFICATION", 0),
          intent: "TRANSFER_VERIFICATION",
          targetStep: "transfer_verification",
          helpLevel: 0,
          whyThisQuestion: WHY_THIS_QUESTION.TRANSFER_VERIFICATION,
          newProblemContext: newProblem,
        };
      }

      case "COMPLETED":
        return {
          message: "Nice work - you solved a new version independently and could explain why.",
          intent: "COMPLETE",
          targetStep: "completed",
          helpLevel: 0,
        };

      case "ESCALATED":
        return {
          message: "Let's pause the questions here and get you a full worked explanation with a tutor.",
          intent: "ESCALATE",
          targetStep: "escalated",
          helpLevel: 6,
        };

      default: {
        const q = "Which number in the problem represents the value you started with?";
        return {
          message: await this.render(session, "ASK", q, "IDENTIFY_REFERENCE_VALUE", 0),
          intent: "IDENTIFY_REFERENCE_VALUE",
          targetStep: "identify_reference_value",
          helpLevel: 0,
          whyThisQuestion: WHY_THIS_QUESTION.IDENTIFY_REFERENCE_VALUE,
        };
      }
    }
  }
}
