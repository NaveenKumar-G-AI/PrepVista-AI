/**
 * Output guard.
 *
 * The model's structured output is NEVER trusted just because it parsed.
 * This is the second, independent enforcement layer (the first is that
 * the model is only ever told about one level/type at a time — see
 * prompt-builder.ts). Concretely, this file:
 *
 *   - Refuses to let solution_revealed=true (or SOLUTION_ASSISTANCE
 *     content) through unless the POLICY DECISION (not the model)
 *     authorized it.
 *   - Clamps assistance_level/hint_type back to what was actually
 *     assigned if the model drifted.
 *   - Sweeps for suspicious hidden-test-data claims — defense in depth
 *     on top of the structural guarantee that hidden data is never in
 *     the prompt to begin with (see prompt-builder.ts / context-builder).
 *   - Enforces length/content sanity so nothing absurd reaches the UI.
 *
 * Every violation caught here is returned so the caller can log it to
 * telemetry (`solution-leakage attempt`, `hidden-data leakage attempt`,
 * etc.) even though the student never sees the offending content.
 */

import { PolicyDecision } from "./policy-engine";
import { ModelHintResponse } from "./schema";
import { AssistanceLevel, Confidence, HintType } from "./types";

export interface GuardedHintPayload {
  assistanceLevel: AssistanceLevel;
  hintType: HintType;
  observation: string;
  hint: string;
  targetArea: string | null;
  confidence: Confidence;
  teachingObjective: string;
  solutionRevealed: boolean;
}

export interface GuardResult {
  safe: GuardedHintPayload;
  violations: string[];
}

const HIDDEN_TEST_LEAK_PATTERNS = [
  /hidden test\s*#?\s*\d+/i,
  /hidden (input|output|case)s?\s*[:=]/i,
  /the hidden (test|case)s? (is|are|expects?|contains?)/i,
  /reference solution/i,
  /checker (function|logic|script)/i,
];

function scrubHiddenDataClaims(text: string): { text: string; hit: boolean } {
  for (const pattern of HIDDEN_TEST_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      return {
        text: "One or more specific unsupported claims were removed from this hint. Focus on the public information and problem constraints instead.",
        hit: true,
      };
    }
  }
  return { text, hit: false };
}

export function enforceOutputPolicy(model: ModelHintResponse, decision: PolicyDecision): GuardResult {
  const violations: string[] = [];

  // --- Level/type must match what was actually assigned ------------------
  let assistanceLevel = decision.targetLevel;
  let hintType = decision.targetHintType;
  if (model.assistance_level !== decision.targetLevel) {
    violations.push(
      `model_returned_unassigned_level: model said ${model.assistance_level}, assigned was ${decision.targetLevel} — clamped.`
    );
  }
  if (model.hint_type !== decision.targetHintType) {
    // Not necessarily hostile — models sometimes pick a near-synonym —
    // but we still clamp to what the policy engine actually authorized
    // so downstream analytics and anti-repetition stay accurate.
    violations.push(
      `model_returned_unassigned_hint_type: model said ${model.hint_type}, assigned was ${decision.targetHintType} — clamped.`
    );
  }

  // --- Solution-reveal gating (the single most important check here) -----
  const policyAuthorizesSolution = decision.kind === "DELIVER_SOLUTION";
  let solutionRevealed = model.solution_revealed;
  let hint = model.hint;
  let observation = model.observation;

  if (model.solution_revealed && !policyAuthorizesSolution) {
    violations.push("solution_leakage_attempt: model set solution_revealed=true without policy authorization.");
    solutionRevealed = false;
    hint = "A full solution isn't available at this step yet — here's guidance instead: " + genericFallbackFromLevel(assistanceLevel);
  }
  if (!policyAuthorizesSolution && looksLikeFullSolution(hint)) {
    violations.push("solution_leakage_attempt: hint content resembles a complete solution despite no authorization.");
    hint = "That response looked like it might reveal the full solution, so it was withheld. " + genericFallbackFromLevel(assistanceLevel);
    solutionRevealed = false;
  }
  if (policyAuthorizesSolution) {
    solutionRevealed = true;
  }

  // --- Hidden-test-data leakage sweep -------------------------------------
  const hintScrub = scrubHiddenDataClaims(hint);
  if (hintScrub.hit) {
    violations.push("hidden_data_claim_removed_from_hint");
    hint = hintScrub.text;
  }
  const obsScrub = scrubHiddenDataClaims(observation);
  if (obsScrub.hit) {
    violations.push("hidden_data_claim_removed_from_observation");
    observation = obsScrub.text;
  }

  // --- Length sanity (schema already caps this, but re-check post-scrub) -
  if (hint.length > 900) {
    hint = hint.slice(0, 900);
    violations.push("hint_truncated_for_length");
  }

  return {
    safe: {
      assistanceLevel,
      hintType,
      observation,
      hint,
      targetArea: model.target_area,
      confidence: model.confidence as Confidence,
      teachingObjective: model.teaching_objective,
      solutionRevealed,
    },
    violations,
  };
}

function looksLikeFullSolution(text: string): boolean {
  // Heuristic only — a code fence containing what looks like a complete
  // function definition is the strongest cheap signal available without
  // doing a full static-equivalence check against a reference solution
  // (which we deliberately never have access to anyway).
  const hasCodeFence = /```[\s\S]*```/.test(text);
  const hasFunctionShape = /(def\s+\w+\s*\(|function\s+\w+\s*\(|\w+\s+\w+\s*\([^)]*\)\s*\{)/.test(text);
  const hasReturn = /return\b/.test(text);
  return hasCodeFence && hasFunctionShape && hasReturn;
}

export function genericFallbackFromLevel(level: AssistanceLevel): string {
  const messages: Record<AssistanceLevel, string> = {
    INDEPENDENT: "Try running your current code against the examples first.",
    DIRECTION: "Re-read the part of the problem statement about the case your code handles differently than expected.",
    CONCEPT: "Think about which concept from the problem's constraints your current approach might not fully account for.",
    TARGETED: "Look closely at the specific condition or loop bound most connected to the failing behavior.",
    SPECIFIC: "Compare what your code does at the edge of its valid input range with what the problem expects there.",
    DETAILED: "Walk through your code line by line for the smallest failing case you can construct.",
    SOLUTION_ASSISTANCE: "Ask for the next hint level instead — solution assistance isn't available yet.",
  };
  return messages[level];
}
