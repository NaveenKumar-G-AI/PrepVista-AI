import type { AssembledCoachingContext } from "../types";
import type { CoachResponse } from "../schema";

export interface GroundingIssue {
  field: "observation" | "confidence" | "code_locations" | "solution_reveal";
  reason: string;
}

// Phrases that assert a specific, checkable execution fact. If the model
// uses one of these while EXECUTION_EVIDENCE.hasExecuted is false, the
// claim is unsupported by construction — the model cannot know it.
const EXECUTION_CLAIM_PATTERNS = [
  /fails? on test\s*#?\d+/i,
  /test\s*#?\d+\s*(failed|passed)/i,
  /your code (ran|executed) in \d+/i,
  /runtime (was|is) \d+\s*(ms|milliseconds|seconds)/i,
  /compiler reported (line|error)/i,
];

/**
 * Post-generation validation. This is the backstop, not the only defense —
 * the prompt already instructs the model not to do these things — but the
 * backend, not the model's good behavior, is what CodeForge can actually
 * guarantee, so every claim gets checked here before it reaches a student.
 */
export function checkGrounding(ctx: AssembledCoachingContext, response: CoachResponse): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  const claimText = [response.observation, response.next_question, response.student_action].filter(Boolean).join(" ");

  if (!ctx.evidence.hasExecuted) {
    for (const pattern of EXECUTION_CLAIM_PATTERNS) {
      if (pattern.test(claimText)) {
        issues.push({
          field: "observation",
          reason: `Response asserts a specific execution fact (matched ${pattern}) but evidence.hasExecuted is false`,
        });
        break;
      }
    }
  }

  if (response.confidence === "HIGH") {
    const hasHardEvidence =
      ctx.evidence.hasExecuted &&
      (Boolean(ctx.evidence.compilerError) || Boolean(ctx.evidence.runtimeError) || ctx.evidence.testsPassed !== undefined);
    if (!hasHardEvidence) {
      issues.push({ field: "confidence", reason: "HIGH confidence claimed without directly supporting execution/compiler evidence" });
    }
  }

  const totalLines = ctx.code.source.split("\n").length;
  for (const loc of response.code_locations) {
    if (loc.line !== undefined && (loc.line < 1 || loc.line > totalLines)) {
      issues.push({ field: "code_locations", reason: `line ${loc.line} falls outside the ${totalLines}-line source given to the model` });
      break;
    }
  }

  if (ctx.policyMode !== "practice" && (response.solution_reveal || response.response_type === "SOLUTION_ASSISTANCE")) {
    issues.push({ field: "solution_reveal", reason: `solution assistance is not permitted while policyMode=${ctx.policyMode}` });
  }

  return issues;
}

/** Deterministically rewrites a response so every flagged issue is actually resolved, not just logged. */
export function sanitizeAgainstGrounding(response: CoachResponse, issues: GroundingIssue[]): CoachResponse {
  const safe: CoachResponse = { ...response };
  for (const issue of issues) {
    switch (issue.field) {
      case "confidence":
        safe.confidence = "LOW";
        break;
      case "code_locations":
        safe.code_locations = [];
        break;
      case "solution_reveal":
        safe.solution_reveal = false;
        if (safe.response_type === "SOLUTION_ASSISTANCE") safe.response_type = "HINT";
        break;
      case "observation":
        safe.observation =
          "The code has not been executed yet, so I can't verify its runtime behavior. I can still walk through the logic with you — want to start there?";
        safe.confidence = "LOW";
        break;
    }
  }
  return safe;
}
