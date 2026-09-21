import type { SkillNode } from "@/lib/domain/types";
import type { SeedQuestion } from "@/data/seed/questions";

export interface ValidationResult {
  valid: boolean;
  status: "VALIDATED" | "REJECTED";
  notes: string;
}

/**
 * Structural validation pipeline (spec section 34: GENERATE → PARSE → SOLVE/
 * VERIFY → CHECK ANSWER → CHECK OPTIONS → CHECK AMBIGUITY → CHECK METADATA →
 * VALIDATED → AVAILABLE).
 *
 * Honest scope note: this pipeline is source-agnostic by design — the same
 * checks run whether a question is HUMAN_AUTHORED (this prototype's bank,
 * hand-solved and cross-checked before being written) or, in the future,
 * AI_GENERATED. What it does NOT do is independently re-derive the correct
 * answer to an arbitrary word problem (that needs a symbolic math/logic
 * solver well beyond this prototype's scope) — so "SOLVE/VERIFY" here means
 * structural self-consistency (answer is genuinely among the options, no
 * duplicate options, sane metadata), not an independent re-solve. For
 * AI-generated content in a future iteration, that gap is exactly where a
 * real solver or a human-review queue belongs — see README "Remaining
 * limitations".
 */
export function validateQuestion(q: SeedQuestion, skillsById: Record<string, SkillNode>): ValidationResult {
  const problems: string[] = [];

  if (!q.questionText || q.questionText.trim().length < 8) {
    problems.push("question text missing or too short");
  }
  if (!q.explanation || q.explanation.trim().length < 8) {
    problems.push("explanation missing or too short");
  }
  if (!Array.isArray(q.options) || q.options.length < 2) {
    problems.push("fewer than 2 options");
  } else {
    const normalized = q.options.map((o) => o.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
      problems.push("duplicate options detected");
    }
    if (q.options.some((o) => o.trim().length === 0)) {
      problems.push("an option is empty");
    }
  }
  if (!q.options?.includes(q.correctAnswer)) {
    problems.push("correct answer is not present verbatim in the options list");
  }
  if (![1, 2, 3, 4].includes(q.difficulty)) {
    problems.push(`difficulty ${q.difficulty} is outside the supported 1-4 band`);
  }
  if (!["FOUNDATION", "APPLICATION", "TRANSFER"].includes(q.applicationType)) {
    problems.push(`unrecognized applicationType ${q.applicationType}`);
  }
  if (!skillsById[q.skillNodeId]) {
    problems.push(`skillNodeId ${q.skillNodeId} does not exist in the skill hierarchy`);
  }
  if (!q.estimatedTimeSeconds || q.estimatedTimeSeconds < 10 || q.estimatedTimeSeconds > 300) {
    problems.push(`estimatedTimeSeconds ${q.estimatedTimeSeconds} looks unreasonable (expected 10-300)`);
  }
  if (!q.skillTags || q.skillTags.length === 0) {
    problems.push("no skill tags provided");
  }

  if (problems.length > 0) {
    return { valid: false, status: "REJECTED", notes: problems.join("; ") };
  }
  return { valid: true, status: "VALIDATED", notes: "passed all structural checks" };
}
