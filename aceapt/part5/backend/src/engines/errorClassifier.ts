import { ErrorCategory, RelativeSpeed } from "../domain/enums";
import { Question } from "../domain/types";

export interface ClassificationInput {
  question: Question;
  selectedOptionId: string | null;
  relativeSpeed: RelativeSpeed;
  totalTimeMs: number;
  expectedTimeMs: number;
  hintsUsed: number;
}

export interface ClassificationResult {
  category: ErrorCategory;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
  misconceptionNote?: string;
}

/**
 * Classifies why an attempt was wrong (§11). This deliberately does NOT
 * treat every incorrect answer the same, and deliberately does NOT require
 * an LLM call in the hot path — most of the signal is already sitting in
 * the question data if authors tag distractors with the misconception they
 * represent (see Question.options[].misconception). That keeps the
 * classification explainable and instant instead of an opaque black box (§15).
 *
 * Falls back to a timing/hint heuristic only when the selected option
 * wasn't tagged (e.g. no answer selected — timeout) or doesn't exist.
 */
export function classifyError(input: ClassificationInput): ClassificationResult {
  const { question, selectedOptionId, relativeSpeed, hintsUsed, totalTimeMs, expectedTimeMs } = input;

  if (selectedOptionId === null) {
    return {
      category: ErrorCategory.TIME_PRESSURE,
      confidence: "MEDIUM",
      rationale: "No answer was submitted before time ran out.",
    };
  }

  const selected = question.options.find((o) => o.id === selectedOptionId);

  if (selected?.misconception) {
    return {
      category: selected.misconception,
      confidence: "HIGH",
      rationale: `The selected option matches a known misconception pattern for this question.`,
      misconceptionNote: selected.misconceptionNote,
    };
  }

  // Fallback heuristics — used when the distractor isn't tagged.
  const veryFast = totalTimeMs < expectedTimeMs * 0.35;
  const verySlow = totalTimeMs > expectedTimeMs * 1.8;

  if (veryFast && hintsUsed === 0) {
    return {
      category: ErrorCategory.GUESS,
      confidence: "LOW",
      rationale: "Answered far faster than the question typically takes, with no hints used — consistent with a guess.",
    };
  }

  if (veryFast) {
    return {
      category: ErrorCategory.CARELESS_ERROR,
      confidence: "LOW",
      rationale: "Answered unusually quickly — consistent with a careless slip rather than a knowledge gap.",
    };
  }

  if (relativeSpeed === RelativeSpeed.SLOW && hintsUsed >= 2) {
    return {
      category: ErrorCategory.PARTIAL_UNDERSTANDING,
      confidence: "MEDIUM",
      rationale: "Took a long time and used multiple hints but still missed it — some understanding, not yet complete.",
    };
  }

  if (verySlow) {
    return {
      category: ErrorCategory.CONCEPT_GAP,
      confidence: "MEDIUM",
      rationale: "Took much longer than expected and still got it wrong — points toward a gap in the underlying concept.",
    };
  }

  return {
    category: ErrorCategory.UNKNOWN,
    confidence: "LOW",
    rationale: "No strong timing or misconception signal available to classify this miss further.",
  };
}
