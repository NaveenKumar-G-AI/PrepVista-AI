/**
 * HintValidator — §27. Runs on every generated hint (LLM or deterministic — deterministic
 * templates are hand-authored, but the check is cheap and catches template-authoring mistakes
 * too) before it can reach a student. A hint that fails validation is never shown; the caller
 * substitutes a deterministic hint for that exact (type, level) instead — see src/api/app.ts.
 */

import { GeneratedHint, HintType, PolicyDecision, TrustedQuestion } from "../domain/types";

export interface ValidationContext {
  question: TrustedQuestion;
  decision: PolicyDecision;
}

export type ValidationReason =
  | "LEAKS_FINAL_ANSWER"
  | "LEAKS_STEP_VALUE"
  | "LOOKS_LIKE_A_WORKED_RESULT"
  | "TYPE_MISMATCH"
  | "LEVEL_EXCEEDS_DECISION"
  | "TOO_LONG_FOR_LEVEL"
  | "UNTRUSTED_FORMULA"
  | "EMPTY_MESSAGE";

export interface ValidationResult {
  valid: boolean;
  reasons: ValidationReason[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Word-boundary-ish containment check — avoids "20" matching inside "120" or "20:00". */
function containsToken(haystack: string, token: string): boolean {
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(haystack);
}

function textReferencesTrustedFormula(text: string, formula: string): boolean {
  const stripSpaces = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return stripSpaces(text).includes(stripSpaces(formula));
}

/**
 * A plain substring check on the answer breaks for puzzle-style questions where the answer is
 * a short label (e.g. "P") that's also one of several entities a legitimate hint legitimately
 * has to name (P, Q, R, S are all discussed regardless of which one is correct). For short
 * alphabetic tokens like that, only flag a *declarative* statement of the answer — "P is at
 * the other end", "the answer is P" — not any mention of the letter. Numeric/fraction/percent
 * answers don't have this collision, so they keep the stricter plain-containment check.
 */
function isShortNameLikeToken(answer: string): boolean {
  return /^[a-z]{1,3}$/.test(answer);
}

function isDeclaredAsAnswer(text: string, answer: string): boolean {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\bthe answer is\\s+${escaped}\\b`, "i"),
    new RegExp(`\\bis\\s+${escaped}[.!]?\\s*$`, "i"),
    new RegExp(`\\b${escaped}\\s+(is the|sits at|goes in|is your answer|is correct)\\b`, "i"),
  ];
  return patterns.some((re) => re.test(text));
}

export function validateHint(generated: GeneratedHint, ctx: ValidationContext): ValidationResult {
  const reasons: ValidationReason[] = [];
  const text = normalize(generated.message);
  const { decision, question } = ctx;

  if (!text) {
    return { valid: false, reasons: ["EMPTY_MESSAGE"] };
  }

  // ---- Answer-leakage prevention (§26) ---------------------------------------------------
  if (!decision.revealsAnswer) {
    const finalAnswer = normalize(question.finalAnswer);
    const finalAnswerLeaked = isShortNameLikeToken(finalAnswer)
      ? isDeclaredAsAnswer(generated.message, question.finalAnswer)
      : containsToken(text, finalAnswer);
    if (finalAnswerLeaked) reasons.push("LEAKS_FINAL_ANSWER");

    const step = question.solutionSteps.find((s) => s.stepId === decision.targetStepId);
    if (step) {
      const stepValue = normalize(step.correctValue);
      const stepValueLeaked = isShortNameLikeToken(stepValue)
        ? isDeclaredAsAnswer(generated.message, step.correctValue)
        : containsToken(text, stepValue);
      if (stepValueLeaked) reasons.push("LEAKS_STEP_VALUE");
    }

    // A hint that ends in "... = <number>" reads as a handed-over worked result regardless of
    // whether that particular number happens to equal the trusted answer.
    if (/=\s*-?[\d.]+\s*%?\s*$/.test(generated.message.trim())) reasons.push("LOOKS_LIKE_A_WORKED_RESULT");
  }

  // ---- Relevance / conformance with what the policy engine actually decided (§27) --------
  if (generated.hintType !== decision.hintType) reasons.push("TYPE_MISMATCH");
  if (generated.hintLevel > decision.hintLevel) reasons.push("LEVEL_EXCEEDS_DECISION");

  // ---- Minimality (§16, §82) — soft ceiling, generous margin over the target word count ---
  const wordCount = generated.message.trim().split(/\s+/).filter(Boolean).length;
  if (decision.maxWords > 0 && wordCount > decision.maxWords * 1.6) reasons.push("TOO_LONG_FOR_LEVEL");

  // ---- Mathematical correctness spot-check (§29) — a formula hint must use the trusted one ---
  const step = question.solutionSteps.find((s) => s.stepId === decision.targetStepId);
  if (step?.formula && decision.hintType === HintType.FORMULA && generated.message.includes("=")) {
    if (!textReferencesTrustedFormula(generated.message, step.formula) && generated.source === "LLM") {
      reasons.push("UNTRUSTED_FORMULA");
    }
  }

  return { valid: reasons.length === 0, reasons };
}
