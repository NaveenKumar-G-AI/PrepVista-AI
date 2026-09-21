/**
 * Trusted question bank for this reference build (§28: "hints should be based on trusted
 * question, trusted solution... not an LLM reconstructing a question from memory").
 *
 * In a real ACEAPT deployment this file doesn't exist — Feature 48 reads from the existing
 * question/solution store. These three problems (one per skill family) exist purely so this
 * standalone build has something real to diagnose against, generate hints for, and test.
 *
 * Each step is answered through a small, closed set of canonical values (an MCQ id for
 * "which approach", a number for "compute it") rather than free text. That mirrors how a real
 * Guided Solving step (Feature 47) actually submits an attempt, and it's what makes mistake
 * classification below deterministic instead of guesswork.
 */

import { MistakeSignal, TrustedQuestion } from "./types";

function num(raw: string): number {
  return parseFloat(raw.trim());
}

// -----------------------------------------------------------------------------------------
// 1) PERCENTAGE — grounds the spec's own worked example (§89, §115)
// -----------------------------------------------------------------------------------------
const percentage: TrustedQuestion = {
  problemId: "percentage-basic-1",
  skillId: "PERCENTAGE",
  difficulty: "EASY",
  prompt: "The price of an item increases from ₹500 to ₹600. Find the percentage increase.",
  finalAnswer: "20%",
  solutionSteps: [
    {
      stepId: "strategy",
      title: "Choose the approach",
      explanation:
        "Percentage increase compares the increase with the ORIGINAL amount, not the new one: (New − Original) / Original × 100.",
      formula: "(New - Original) / Original * 100",
      correctValue: "opt_correct",
    },
    {
      stepId: "execution",
      title: "Substitute and compute",
      explanation: "Increase = 600 − 500 = 100. Divide by the original value, 500, then multiply by 100.",
      correctValue: "20",
    },
  ],
  classifyMistake(stepId, normalized) {
    if (stepId === "strategy") {
      if (normalized === "opt_unsure" || normalized === "") return MistakeSignal.NO_ATTEMPT;
      if (normalized === "opt_correct") return MistakeSignal.NONE;
      return MistakeSignal.WRONG_FORMULA; // opt_wrong_denominator / opt_ratio_only
    }
    // execution step
    if (normalized === "") return MistakeSignal.NO_ATTEMPT;
    const n = num(normalized);
    if (Number.isNaN(n)) return MistakeSignal.CALCULATION_ERROR;
    if (Math.abs(n - 20) < 0.05) return MistakeSignal.NONE;
    if (Math.abs(n - 16.67) < 0.5) return MistakeSignal.WRONG_REFERENCE_VALUE; // divided by 600 instead of 500
    return MistakeSignal.CALCULATION_ERROR;
  },
};

// -----------------------------------------------------------------------------------------
// 2) PROBABILITY — grounds §94 ("ignore the probability calculation, count outcomes first")
// -----------------------------------------------------------------------------------------
const probability: TrustedQuestion = {
  problemId: "probability-basic-1",
  skillId: "PROBABILITY",
  difficulty: "MEDIUM",
  prompt:
    "A bag has 4 red and 6 blue balls (10 total). Two balls are drawn together at random. Find the probability that both are red.",
  finalAnswer: "2/15",
  solutionSteps: [
    {
      stepId: "strategy",
      title: "Decide what to count",
      explanation:
        "Count total ways to choose 2 balls from 10 (C(10,2) = 45), and favourable ways to choose 2 red from 4 (C(4,2) = 6), since the draw has no replacement.",
      formula: "C(4,2) / C(10,2)",
      correctValue: "opt_correct",
    },
    {
      stepId: "execution",
      title: "Compute the probability",
      explanation: "6 favourable outcomes out of 45 total outcomes simplifies to 2/15 (≈ 0.1333).",
      correctValue: "2/15",
    },
  ],
  classifyMistake(stepId, normalized) {
    if (stepId === "strategy") {
      if (normalized === "opt_unsure" || normalized === "") return MistakeSignal.NO_ATTEMPT;
      if (normalized === "opt_correct") return MistakeSignal.NONE;
      return MistakeSignal.WRONG_STRATEGY; // opt_with_replacement: treats draws as independent
    }
    if (normalized === "") return MistakeSignal.NO_ATTEMPT;
    const n = normalized.includes("/") ? evalFraction(normalized) : num(normalized);
    if (Number.isNaN(n)) return MistakeSignal.CALCULATION_ERROR;
    if (Math.abs(n - 2 / 15) < 0.01) return MistakeSignal.NONE;
    return MistakeSignal.CALCULATION_ERROR;
  },
};

function evalFraction(s: string): number {
  const [a, b] = s.split("/").map((p) => parseFloat(p.trim()));
  if (!b) return NaN;
  return a / b;
}

// -----------------------------------------------------------------------------------------
// 3) LOGICAL PUZZLE — grounds §95 ("start with the constraint that fixes a position")
// -----------------------------------------------------------------------------------------
const puzzle: TrustedQuestion = {
  problemId: "puzzle-seating-1",
  skillId: "LOGICAL_PUZZLE",
  difficulty: "MEDIUM",
  prompt:
    "Four friends P, Q, R and S sit in a row facing north, in seats 1–4 left to right. R is second from the left. Q is at one of the two ends. P is not adjacent to R. Who sits at the other end?",
  finalAnswer: "P",
  solutionSteps: [
    {
      stepId: "strategy",
      title: "Pick the strongest constraint first",
      explanation:
        "\"R is second from the left\" fixes one exact seat. Placing that first collapses the possibilities far more than an exclusion rule does.",
      correctValue: "opt_correct",
    },
    {
      stepId: "execution",
      title: "Work out who is left",
      explanation:
        "With R in seat 2, Q must take seat 1 or 4. P can't sit in seat 1 or 3 (both adjacent to R), so if Q takes seat 1, P must take seat 4 — the only seat left that satisfies every constraint.",
      correctValue: "P",
    },
  ],
  classifyMistake(stepId, normalized) {
    if (stepId === "strategy") {
      if (normalized === "opt_unsure" || normalized === "") return MistakeSignal.NO_ATTEMPT;
      if (normalized === "opt_correct") return MistakeSignal.NONE;
      return MistakeSignal.WRONG_STRATEGY; // opt_weaker_constraint
    }
    if (normalized === "") return MistakeSignal.NO_ATTEMPT;
    if (normalized.toUpperCase() === "P") return MistakeSignal.NONE;
    return MistakeSignal.CALCULATION_ERROR; // right strategy, wrong execution of the deduction
  },
};

export const SAMPLE_QUESTIONS: TrustedQuestion[] = [percentage, probability, puzzle];

export function getTrustedQuestionOrThrow(problemId: string): TrustedQuestion {
  const q = SAMPLE_QUESTIONS.find((q) => q.problemId === problemId);
  if (!q) throw new Error(`Unknown problemId: ${problemId}`);
  return q;
}
