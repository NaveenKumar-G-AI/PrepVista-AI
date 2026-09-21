import type { MistakeIntelligencePort } from "../types/contracts.js";
import { classifyTiming, isImplausiblyFast } from "./timingIntelligence.js";

/**
 * Module 15: "Use existing Mistake Intelligence if available. Do NOT create
 * duplicate mistake classification systems." No such system was reachable
 * this session (see TRUTH_TABLE.md), so this is the fallback — and it is
 * deliberately conservative about what it claims.
 *
 * What it CAN ground from timing + difficulty alone: rushing, guessing,
 * and a slow multi-step breakdown pattern. What it CANNOT honestly claim
 * without seeing the actual wrong answer against known misconception
 * patterns for that question: "formula misuse" vs "interpretation issue"
 * vs "calculation error". Real Mistake Intelligence — or per-question
 * "common wrong answer" annotations this build doesn't have — would be
 * needed for that finer grain. This fallback does not fabricate it.
 */
export const deterministicMistakeIntelligence: MistakeIntelligencePort = {
  async classify({ isCorrect, hintUsed, durationMs, expectedDurationMs, difficulty, confidence }) {
    const signals: string[] = [];
    if (isCorrect !== false) return signals; // only classifies mistakes

    const timing = classifyTiming(durationMs, expectedDurationMs, false);

    if (isImplausiblyFast(durationMs, expectedDurationMs)) {
      signals.push("guessing");
    } else if (timing === "fast_wrong") {
      signals.push("rushing");
    } else if (timing === "slow_wrong" && (difficulty === "hard" || difficulty === "very_hard")) {
      signals.push("multi_step_breakdown");
    } else if (timing === "expected_wrong" || timing === "slow_wrong") {
      signals.push("possible_concept_gap");
    }

    if (hintUsed) signals.push("required_assistance");
    if (confidence !== undefined && confidence >= 4) signals.push("high_confidence_despite_error");

    return signals;
  },
};
