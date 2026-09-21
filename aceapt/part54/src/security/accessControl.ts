import type { Role, ValidationRunResult } from "../contracts/types.js";

const PRIVILEGED_ROLES: ReadonlySet<Role> = new Set(["CONTENT_EDITOR", "REVIEWER", "ADMIN", "SYSTEM"]);

/** What a STUDENT or TRAINER is ever allowed to see about a validation run
 *  (spec §150, §177) — no validator names, no error codes, no evidence. Just
 *  enough to explain why a question might not appear. */
export interface PublicValidationView {
  questionId: string;
  versionId: string;
  available: boolean;
  message: string;
}

export type RoleScopedValidationView = ValidationRunResult | PublicValidationView;

export function scopeRunForRole(run: ValidationRunResult, role: Role, forMode: "practice" | "timed" | "assessment" = "practice"): RoleScopedValidationView {
  if (PRIVILEGED_ROLES.has(role)) return run;

  const available = run.eligibility[forMode];
  const message = available
    ? "This question is available."
    : run.overallStatus === "STALE"
      ? "This question has been updated and is being re-checked."
      : "This question is temporarily unavailable.";

  return { questionId: run.questionId, versionId: run.versionId, available, message };
}

/**
 * Defense-in-depth runtime guard (spec §149, §214): scans a serialized
 * response for evidence-shaped keys that must NEVER reach a non-privileged
 * caller, independent of whether the TypeScript types were respected at every
 * call site. Meant to run in tests and, cheaply, at the API boundary.
 */
const FORBIDDEN_KEYS_FOR_PUBLIC_VIEW = [
  "declaredAnswer",
  "derivedAnswer",
  "correctOptionIds",
  "correctOptionId",
  "finalAnswer",
  "finalAnswerNumeric",
  "fullSolution",
  "solutionFinalAnswer",
  "equivalentOptionIds",
  "evidence"
];

export function assertNoAnswerLeakage(payload: unknown): { safe: true } | { safe: false; foundKeys: string[] } {
  const serialized = JSON.stringify(payload);
  const found = FORBIDDEN_KEYS_FOR_PUBLIC_VIEW.filter((key) => serialized.includes(`"${key}"`));
  return found.length === 0 ? { safe: true } : { safe: false, foundKeys: found };
}
