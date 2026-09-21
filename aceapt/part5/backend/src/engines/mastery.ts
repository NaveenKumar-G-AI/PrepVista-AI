import { MasteryState, QuestionType } from "../domain/enums";
import { Attempt, SkillPracticeState } from "../domain/types";

export interface MasteryAssessment {
  state: MasteryState;
  rationale: string;
  evidence: {
    distinctStructuresCorrect: number;
    hasApplicationCorrect: boolean;
    hasTransferCorrect: boolean;
    averageHintsOnCorrect: number;
    recentAccuracy: number;
  };
}

const DIVERSITY_THRESHOLD = 4;
const HINT_INDEPENDENCE_THRESHOLD = 1.0; // avg hints per correct attempt must be below this
const ACCURACY_THRESHOLD = 0.75;

export interface MasteryCriteriaContext {
  /** Does this skill have any APPLICATION-type content at all? If not, the
   * requirement is dropped rather than permanently blocking mastery for a
   * purely foundational skill that was never meant to have it. */
  skillHasApplicationContent: boolean;
  skillHasTransferContent: boolean;
}

/**
 * §24 — a single correct answer is weak evidence. Mastery requires: enough
 * distinct question structures answered correctly, at least one APPLICATION
 * and one TRANSFER question correct (when the skill actually has that kind
 * of content — see MasteryCriteriaContext), low hint dependence, and
 * accuracy above threshold across the recent window. Explicitly blocked by
 * a suspected-memorization flag (§17).
 */
export function assessMastery(
  state: SkillPracticeState,
  recentAttempts: Attempt[],
  questionTypeByQuestionId: Map<string, QuestionType>,
  criteria: MasteryCriteriaContext = { skillHasApplicationContent: true, skillHasTransferContent: true }
): MasteryAssessment {
  const correctAttempts = recentAttempts.filter((a) => a.isCorrect);
  const distinctStructuresCorrect = new Set(correctAttempts.map((a) => a.questionId)).size;
  const hasApplicationCorrect =
    !criteria.skillHasApplicationContent || correctAttempts.some((a) => questionTypeByQuestionId.get(a.questionId) === QuestionType.APPLICATION);
  const hasTransferCorrect =
    !criteria.skillHasTransferContent || correctAttempts.some((a) => questionTypeByQuestionId.get(a.questionId) === QuestionType.TRANSFER);
  const averageHintsOnCorrect =
    correctAttempts.length > 0 ? correctAttempts.reduce((s, a) => s + a.hintsUsed, 0) / correctAttempts.length : 99;

  const evidence = {
    distinctStructuresCorrect,
    hasApplicationCorrect,
    hasTransferCorrect,
    averageHintsOnCorrect,
    recentAccuracy: state.recentAccuracy,
  };

  if (state.suspectedMemorization) {
    return {
      state: MasteryState.MASTERY_NOT_STABLE,
      rationale: "Accuracy looks strong, but mostly on questions seen before — not enough evidence of transferable understanding yet.",
      evidence,
    };
  }

  if (state.attemptCount < 3) {
    return { state: MasteryState.NOT_STARTED, rationale: "Not enough attempts yet to assess.", evidence };
  }

  const meetsCore =
    distinctStructuresCorrect >= DIVERSITY_THRESHOLD &&
    hasApplicationCorrect &&
    hasTransferCorrect &&
    averageHintsOnCorrect < HINT_INDEPENDENCE_THRESHOLD &&
    state.recentAccuracy >= ACCURACY_THRESHOLD;

  if (meetsCore) {
    return {
      state: MasteryState.VERIFIED_MASTERY,
      rationale: `${distinctStructuresCorrect} distinct correct answers including application and transfer questions, with low hint use and ${Math.round(
        state.recentAccuracy * 100
      )}% recent accuracy.`,
      evidence,
    };
  }

  if (state.recentAccuracy >= ACCURACY_THRESHOLD && (!hasApplicationCorrect || !hasTransferCorrect || distinctStructuresCorrect < DIVERSITY_THRESHOLD)) {
    return {
      state: MasteryState.APPROACHING_MASTERY,
      rationale: "Accuracy is strong, but mastery evidence still needs more variety (application/transfer/diverse structures) before it's verified.",
      evidence,
    };
  }

  return {
    state: MasteryState.DEVELOPING,
    rationale: `Recent accuracy is ${Math.round(state.recentAccuracy * 100)}% — still building toward mastery.`,
    evidence,
  };
}

export interface VerificationStageResult {
  stageName: "STANDARD" | "APPLICATION" | "TRANSFER" | "TIMED";
  nextStageIndex: number | null;
  passed: boolean;
}

const VERIFICATION_STAGES: { name: VerificationStageResult["stageName"]; type: QuestionType }[] = [
  { name: "STANDARD", type: QuestionType.STANDARD_PRACTICE },
  { name: "APPLICATION", type: QuestionType.APPLICATION },
  { name: "TRANSFER", type: QuestionType.TRANSFER },
  { name: "TIMED", type: QuestionType.SPEED },
];

/** §25 — the Standard → Application → Transfer → Timed verification sequence. */
export function verificationQuestionTypeForStage(stageIndex: number): QuestionType {
  return VERIFICATION_STAGES[Math.min(stageIndex, VERIFICATION_STAGES.length - 1)].type;
}

export function evaluateVerificationStage(stageIndex: number, attempt: Attempt): VerificationStageResult {
  const stage = VERIFICATION_STAGES[stageIndex];
  const passed = attempt.isCorrect && attempt.hintsUsed <= 1;
  const nextStageIndex = passed && stageIndex + 1 < VERIFICATION_STAGES.length ? stageIndex + 1 : null;
  return { stageName: stage.name, nextStageIndex, passed };
}

export function isVerificationComplete(stageIndex: number): boolean {
  return stageIndex >= VERIFICATION_STAGES.length;
}
