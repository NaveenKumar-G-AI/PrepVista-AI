import type { PoolClient } from "pg";
import type { VerificationObjective, VerificationQuestionPlanItem, VerificationAttempt, MasteryStateEnum, Question, NoveltyLevel, ContextType, EvidenceType } from "../types/index.js";
import { createVerificationAttempt, getVerificationAttempt, updateAttemptProgress, completeAttempt } from "../repositories/verificationAttemptRepository.js";
import { findQuestionById } from "../repositories/questionRepository.js";
import { getMasteryState } from "../repositories/masteryStateRepository.js";
import { selectQuestionForVerification, NoQuestionAvailableError } from "./questionVariationService.js";
import { submitQuestionEvidence } from "./masteryEvidenceService.js";
import { emitSignal } from "./integration/signalBus.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";
import { genId } from "../lib/ids.js";

export class VerificationSessionUnavailableError extends Error {}
export class InvalidAttemptStateError extends Error {}

interface PlanSlotTemplate {
  noveltyLevel: NoveltyLevel;
  timed: boolean;
}
interface ObjectivePlan {
  slots: PlanSlotTemplate[];
  contextType: ContextType;
}

/** Question plans per verification objective (spec sections 28-31). Every
 *  objective past PROVISIONAL_CHECK hides the topic label (MIXED_CONTEXT)
 *  and runs under a timer - this is what makes a verification session feel
 *  different from ordinary practice, per spec section 29/57. */
const OBJECTIVE_PLANS: Record<VerificationObjective, ObjectivePlan> = {
  PROVISIONAL_CHECK: { contextType: "LABELED", slots: [{ noveltyLevel: "FAMILIAR", timed: false }, { noveltyLevel: "FAMILIAR", timed: false }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: false }] },
  VERIFY_TRANSFER: {
    contextType: "MIXED_CONTEXT",
    slots: [
      { noveltyLevel: "SLIGHTLY_VARIANT", timed: true },
      { noveltyLevel: "SLIGHTLY_VARIANT", timed: true },
      { noveltyLevel: "NOVEL", timed: true },
      { noveltyLevel: "NOVEL", timed: true },
      { noveltyLevel: "NOVEL", timed: true },
    ],
  },
  STABILITY_CHECK: { contextType: "MIXED_CONTEXT", slots: [{ noveltyLevel: "SLIGHTLY_VARIANT", timed: true }, { noveltyLevel: "NOVEL", timed: true }, { noveltyLevel: "NOVEL", timed: true }] },
  MAINTENANCE_CHECK: { contextType: "MIXED_CONTEXT", slots: [{ noveltyLevel: "SLIGHTLY_VARIANT", timed: true }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: true }, { noveltyLevel: "NOVEL", timed: true }] },
  DELAYED_VERIFICATION: { contextType: "LABELED", slots: [{ noveltyLevel: "SLIGHTLY_VARIANT", timed: false }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: false }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: false }] },
  RECOVERY_CHECK: {
    contextType: "MIXED_CONTEXT",
    slots: [{ noveltyLevel: "FAMILIAR", timed: true }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: true }, { noveltyLevel: "SLIGHTLY_VARIANT", timed: true }, { noveltyLevel: "NOVEL", timed: true }],
  },
};

/** Infers the right objective from current mastery state when the caller
 *  (typically the review queue) doesn't specify one explicitly. */
export function inferObjectiveFromState(state: MasteryStateEnum): VerificationObjective {
  switch (state) {
    case "AT_RISK":
    case "REGRESSED":
      return "RECOVERY_CHECK";
    case "STABLE_MASTERED":
      return "MAINTENANCE_CHECK";
    case "VERIFIED_MASTERED":
      return "STABILITY_CHECK";
    case "PROVISIONALLY_MASTERED":
      return "VERIFY_TRANSFER";
    default:
      return "PROVISIONAL_CHECK";
  }
}

export interface StartVerificationInput {
  studentId: string;
  skillId: string;
  skillKey: string;
  skillName: string;
  objective?: VerificationObjective;
}

export async function startVerificationSession(client: PoolClient, input: StartVerificationInput): Promise<VerificationAttempt> {
  const currentState = await getMasteryState(client, input.studentId, input.skillId);
  const objective = input.objective ?? inferObjectiveFromState(currentState?.state ?? "UNKNOWN");
  const template = OBJECTIVE_PLANS[objective];

  const plan: VerificationQuestionPlanItem[] = [];
  const selectedQuestionIds: string[] = [];
  try {
    for (const slot of template.slots) {
      const question = await selectQuestionForVerification(client, {
        studentId: input.studentId,
        skillId: input.skillId,
        skillKey: input.skillKey,
        skillName: input.skillName,
        noveltyLevel: slot.noveltyLevel,
        contextType: template.contextType,
        difficultyTarget: currentState?.conceptScore ?? 0.5,
        excludeQuestionIds: selectedQuestionIds,
      });
      selectedQuestionIds.push(question.id);
      plan.push({
        questionId: question.id,
        noveltyLevel: slot.noveltyLevel,
        contextType: template.contextType,
        timed: slot.timed,
        expectedTimeSeconds: question.expectedTimeSeconds,
      });
    }
  } catch (err) {
    if (err instanceof NoQuestionAvailableError) {
      throw new VerificationSessionUnavailableError(
        `Not enough question variety available yet for this skill to run a ${objective} verification. Add more seed questions or configure an AI provider.`
      );
    }
    throw err;
  }

  return createVerificationAttempt(client, { id: genId(), studentId: input.studentId, skillId: input.skillId, objective, questionPlan: plan });
}

export interface CurrentQuestionView {
  attemptId: string;
  objective: VerificationObjective;
  questionIndex: number;
  totalQuestions: number;
  question: { id: string; prompt: string; choices: Question["choices"]; timed: boolean; expectedTimeSeconds: number };
  /** Per spec section 29: hidden unless the session's contextType is LABELED. */
  skillNameVisible: boolean;
}

export async function getCurrentQuestion(client: PoolClient, attemptId: string, skillName: string): Promise<CurrentQuestionView | null> {
  const attempt = await getVerificationAttempt(client, attemptId);
  if (!attempt || attempt.status !== "IN_PROGRESS") return null;
  if (attempt.currentIndex >= attempt.questionPlan.length) return null;

  const planItem = attempt.questionPlan[attempt.currentIndex];
  const question = await findQuestionById(client, planItem.questionId);
  if (!question) throw new InvalidAttemptStateError(`Question ${planItem.questionId} referenced by attempt ${attemptId} no longer exists.`);

  return {
    attemptId,
    objective: attempt.objective,
    questionIndex: attempt.currentIndex,
    totalQuestions: attempt.questionPlan.length,
    question: { id: question.id, prompt: question.prompt, choices: question.choices, timed: planItem.timed, expectedTimeSeconds: planItem.expectedTimeSeconds },
    skillNameVisible: planItem.contextType === "LABELED",
  };
}

function inferEvidenceType(objective: VerificationObjective, novelty: NoveltyLevel, contextType: ContextType): EvidenceType {
  if (objective === "DELAYED_VERIFICATION") return "DELAYED";
  if (novelty === "NOVEL" || novelty === "COMPLEX_APPLICATION") return "TRANSFER";
  if (novelty === "SLIGHTLY_VARIANT") return "VARIATION";
  if (contextType === "MIXED_CONTEXT") return "MIXED_CONTEXT";
  return "PRACTICE";
}

export interface SubmitAnswerInput {
  attemptId: string;
  studentId: string;
  skillId: string;
  studentAnswer: string;
  timeTakenSeconds: number;
}

export interface SubmitAnswerResult {
  isSessionComplete: boolean;
}

export async function submitAnswer(client: PoolClient, input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const attempt = await getVerificationAttempt(client, input.attemptId);
  if (!attempt || attempt.status !== "IN_PROGRESS") {
    throw new InvalidAttemptStateError("Verification attempt is not in progress.");
  }
  if (attempt.currentIndex >= attempt.questionPlan.length) {
    throw new InvalidAttemptStateError("All questions in this attempt have already been answered.");
  }

  const planItem = attempt.questionPlan[attempt.currentIndex];
  const question = await findQuestionById(client, planItem.questionId);
  if (!question) throw new InvalidAttemptStateError(`Question ${planItem.questionId} no longer exists.`);

  // Deterministic, server-side correctness check - never delegated to the AI
  // path (spec section 45/46). Exact match against the stored correct id.
  const correct = input.studentAnswer === question.correctAnswer;
  const score = correct ? 1 : 0;
  const evidenceType = inferEvidenceType(attempt.objective, planItem.noveltyLevel, planItem.contextType);

  await submitQuestionEvidence(client, {
    studentId: input.studentId,
    skillId: input.skillId,
    questionId: question.id,
    wasCorrect: correct,
    score,
    evidenceType,
    difficulty: question.difficulty,
    timed: planItem.timed,
    timeTakenSeconds: input.timeTakenSeconds,
    expectedTimeSeconds: planItem.expectedTimeSeconds,
    contextType: planItem.contextType,
    noveltyLevel: planItem.noveltyLevel,
    source: "VERIFICATION_SESSION",
    verificationAttemptId: attempt.id,
  });

  const updatedPlan = [...attempt.questionPlan];
  updatedPlan[attempt.currentIndex] = {
    ...planItem,
    answeredAt: new Date().toISOString(),
    studentAnswer: input.studentAnswer,
    correct,
    timeTakenSeconds: input.timeTakenSeconds,
  };
  const nextIndex = attempt.currentIndex + 1;
  await updateAttemptProgress(client, attempt.id, updatedPlan, nextIndex);

  return { isSessionComplete: nextIndex >= updatedPlan.length };
}

export interface VerificationResultView {
  attemptId: string;
  objective: VerificationObjective;
  result: "MASTERY_VERIFIED" | "NOT_STABLE_YET";
  state: MasteryStateEnum;
  confidence: string;
  dimensions: Record<string, number | null>;
  correctCount: number;
  totalQuestions: number;
  nextRecommendedFocus: string | null;
}

type DimensionKey = "conceptScore" | "executionScore" | "transferScore" | "retentionScore" | "timedScore" | "consistencyScore";
const DIMENSION_LABELS: Record<DimensionKey, string> = {
  conceptScore: "CONCEPT REVIEW",
  executionScore: "GUIDED PRACTICE",
  transferScore: "TRANSFER PRACTICE",
  retentionScore: "SPACED REVIEW",
  timedScore: "TIMED DRILLS",
  consistencyScore: "CONSISTENCY PRACTICE",
};
const DIMENSION_THRESHOLDS: Record<DimensionKey, (c: ReturnType<typeof getMasteryModelConfig>) => number> = {
  conceptScore: (c) => c.thresholds.provisional.conceptMin,
  executionScore: (c) => c.thresholds.provisional.executionMin,
  transferScore: (c) => c.thresholds.verified.transferMin,
  retentionScore: (c) => c.thresholds.stable.retentionMin,
  timedScore: () => 0.7,
  consistencyScore: (c) => c.thresholds.stable.consistencyMin,
};

/**
 * Which dimensions are even relevant to "next recommended focus" depends on
 * which gate the student is actually stuck at (spec section 31's example is
 * specifically a PROVISIONALLY_MASTERED student whose transfer is weak - it
 * would be misleading to tell someone who hasn't learned the concept yet to
 * go do "transfer practice"). Earlier states only look at concept/execution;
 * later states only look at the dimension(s) gating their next promotion.
 */
function relevantDimensionsForState(state: MasteryStateEnum): DimensionKey[] {
  switch (state) {
    case "VERIFIED_MASTERED":
    case "AT_RISK":
    case "REGRESSED":
      return ["consistencyScore", "retentionScore", "timedScore"];
    case "PROVISIONALLY_MASTERED":
      return ["transferScore"];
    default:
      return ["conceptScore", "executionScore"];
  }
}

export async function completeVerificationSession(client: PoolClient, attemptId: string, studentId: string, skillId: string): Promise<VerificationResultView> {
  const attempt = await getVerificationAttempt(client, attemptId);
  if (!attempt || attempt.status !== "IN_PROGRESS") throw new InvalidAttemptStateError("Verification attempt is not in progress.");
  if (attempt.currentIndex < attempt.questionPlan.length) throw new InvalidAttemptStateError("Not all questions have been answered yet.");

  const config = getMasteryModelConfig();
  const state = await getMasteryState(client, studentId, skillId);
  if (!state) throw new InvalidAttemptStateError("No mastery state found after completing verification - this should not happen.");

  const result: "MASTERY_VERIFIED" | "NOT_STABLE_YET" = state.state === "VERIFIED_MASTERED" || state.state === "STABLE_MASTERED" ? "MASTERY_VERIFIED" : "NOT_STABLE_YET";
  const correctCount = attempt.questionPlan.filter((q) => q.correct).length;

  let nextRecommendedFocus: string | null = null;
  if (result === "NOT_STABLE_YET") {
    let worstGap = 0; // only a genuinely positive gap (score below its threshold) is worth recommending
    for (const key of relevantDimensionsForState(state.state)) {
      const score = state[key];
      if (score === null) continue;
      const gap = DIMENSION_THRESHOLDS[key](config) - score;
      if (gap > worstGap) {
        worstGap = gap;
        nextRecommendedFocus = DIMENSION_LABELS[key];
      }
    }
    // Either every relevant dimension already clears its threshold (the gate
    // is really an evidence-COUNT shortfall, not a score shortfall) or there's
    // no evidence yet for any of them - either way, point at the earliest gate
    // rather than leaving this null.
    if (nextRecommendedFocus === null) nextRecommendedFocus = DIMENSION_LABELS[relevantDimensionsForState(state.state)[0]];
  }

  const evidenceSummary = {
    directPerformance: state.conceptScore,
    executionPerformance: state.executionScore,
    transferPerformance: state.transferScore,
    retentionPerformance: state.retentionScore,
    timedPerformance: state.timedScore,
    consistencyPerformance: state.consistencyScore,
    state: state.state,
    confidence: state.confidence,
    correctCount,
    totalQuestions: attempt.questionPlan.length,
    nextRecommendedFocus,
  };

  await completeAttempt(client, attemptId, "COMPLETED", result, evidenceSummary);

  if (result === "NOT_STABLE_YET" && nextRecommendedFocus === "TRANSFER PRACTICE") {
    await emitSignal(client, "FEATURE_7", {
      studentId,
      skillId,
      signal: "TRANSFER_WEAK",
      severity: "MEDIUM",
      confidence: state.confidence === "HIGH" ? 0.85 : state.confidence === "MEDIUM" ? 0.65 : 0.4,
      evidence: { direct_accuracy: state.conceptScore, transfer_accuracy: state.transferScore },
    });
  }
  if (result === "NOT_STABLE_YET" && nextRecommendedFocus === "TIMED DRILLS") {
    await emitSignal(client, "FEATURE_7", {
      studentId,
      skillId,
      signal: "TIMED_PERFORMANCE_WEAK",
      severity: "MEDIUM",
      confidence: state.confidence === "HIGH" ? 0.85 : state.confidence === "MEDIUM" ? 0.65 : 0.4,
      evidence: { concept_accuracy: state.conceptScore, timed_accuracy: state.timedScore },
    });
  }

  return {
    attemptId,
    objective: attempt.objective,
    result,
    state: state.state,
    confidence: state.confidence,
    dimensions: {
      conceptScore: state.conceptScore,
      executionScore: state.executionScore,
      transferScore: state.transferScore,
      retentionScore: state.retentionScore,
      timedScore: state.timedScore,
      consistencyScore: state.consistencyScore,
    },
    correctCount,
    totalQuestions: attempt.questionPlan.length,
    nextRecommendedFocus,
  };
}

export async function abandonVerificationSession(client: PoolClient, attemptId: string): Promise<void> {
  const attempt = await getVerificationAttempt(client, attemptId);
  if (!attempt || attempt.status !== "IN_PROGRESS") return;
  await completeAttempt(client, attemptId, "ABANDONED", null, { reason: "Abandoned by student or client." });
}
