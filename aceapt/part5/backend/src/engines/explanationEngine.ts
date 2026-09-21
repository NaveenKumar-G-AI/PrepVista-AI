import { ErrorCategory } from "../domain/enums";
import { Question } from "../domain/types";
import { ClassificationResult } from "./errorClassifier";

export interface IncorrectExplanation {
  whatHappened: string;
  whereReasoningFailed: string;
  correctReasoning: string;
  howToAvoid: string;
  retryPrompt: string;
}

export interface CorrectExplanation {
  whyCorrect: string;
  efficientApproach?: string;
  shortcut?: string;
  transferChallenge?: string;
}

const AVOID_TIPS: Partial<Record<ErrorCategory, string>> = {
  [ErrorCategory.CALCULATION_ERROR]:
    "Estimate the answer roughly before calculating precisely — it catches most arithmetic slips immediately.",
  [ErrorCategory.CARELESS_ERROR]:
    "Re-read the final number you circle against the question before submitting — a 5-second check catches most of these.",
  [ErrorCategory.CONCEPT_GAP]: "Re-derive the rule from first principles once, slowly, instead of pattern-matching to a similar-looking problem.",
  [ErrorCategory.PROCEDURAL_ERROR]: "Write out each step explicitly rather than skipping ahead — the break usually happens mid-procedure.",
  [ErrorCategory.MISREAD]: "Underline the exact quantity being asked for before starting to solve.",
  [ErrorCategory.TIME_PRESSURE]: "Practice this skill untimed a few more times before reintroducing a clock.",
  [ErrorCategory.GUESS]: "If nothing comes to mind, use a hint rather than guessing — a guess gives no usable signal either way.",
  [ErrorCategory.LOGICAL_ERROR]: "Check that each step actually follows from the one before it, not just that the final number looks plausible.",
  [ErrorCategory.PARTIAL_UNDERSTANDING]: "Revisit the concept explanation once more, then retry — you're close.",
  [ErrorCategory.UNKNOWN]: "Review the full explanation below, then retry with a similar question.",
};

/** §22 (incorrect branch) */
export function explainIncorrect(question: Question, classification: ClassificationResult, selectedOptionId: string | null): IncorrectExplanation {
  const selected = question.options.find((o) => o.id === selectedOptionId);
  const whatHappened = selected
    ? `The option chosen was "${selected.text}", which isn't correct here.`
    : "No answer was selected in time.";

  const whereReasoningFailed = selected?.misconceptionNote ?? classification.rationale;

  return {
    whatHappened,
    whereReasoningFailed,
    correctReasoning: question.explanation.correctReasoning,
    howToAvoid: question.explanation.howToAvoidMistake ?? AVOID_TIPS[classification.category] ?? AVOID_TIPS[ErrorCategory.UNKNOWN]!,
    retryPrompt: "Try a similar question with fresh numbers to confirm this has landed.",
  };
}

/** §22 (correct branch) */
export function explainCorrect(question: Question): CorrectExplanation {
  return {
    whyCorrect: question.explanation.correctReasoning,
    efficientApproach: question.explanation.efficientApproach,
    shortcut: question.explanation.shortcut,
    transferChallenge:
      question.questionType === "TRANSFER"
        ? undefined
        : "Next time this idea shows up in a different context (discount, profit, population), watch for the same underlying structure.",
  };
}
