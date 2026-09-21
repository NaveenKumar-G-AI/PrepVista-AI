/**
 * Security — Understanding Check
 *
 * The primary defense against prompt injection is ARCHITECTURAL, not
 * pattern-matching: student content is never concatenated into the system
 * prompt. It is always passed as clearly delimited DATA inside the user
 * turn, and every system prompt explicitly tells the model that delimited
 * student content is untrusted data to analyze, not instructions to obey
 * (see ai/prompts.ts: STUDENT_DATA_ISOLATION_NOTICE).
 *
 * The pattern-based detector below is a secondary, defense-in-depth signal:
 * it never blocks a response outright (a false positive would unfairly
 * penalize a student who happens to write "ignore the previous step" in a
 * debugging explanation), but it does get logged and can lower the
 * confidence assigned to that evidence item so a manipulation attempt can
 * never *purchase* a higher understanding score than genuine evidence would.
 */

export class AuthorizationError extends Error {
  constructor(message = "Not authorized to access this resource.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface OwnedResource {
  student_id: string;
}

export interface CurrentUser {
  id: string;
  role?: string;
}

/** Throws unless the current user owns the resource (or is staff/admin). */
export function assertOwnership(resource: OwnedResource, user: CurrentUser): void {
  const isOwner = resource.student_id === user.id;
  const isStaff = user.role === "staff" || user.role === "admin";
  if (!isOwner && !isStaff) {
    throw new AuthorizationError();
  }
}

const MAX_RESPONSE_LENGTH = 4000;

export interface SanitizeResult {
  clean: string;
  truncated: boolean;
  flaggedPatterns: string[];
}

/**
 * Wraps untrusted student text for safe inclusion in an AI prompt, and
 * flags (without blocking) content that looks like an injection attempt.
 * The flags feed observability + evidence-confidence damping; they are
 * never themselves treated as grading signal.
 */
export function sanitizeStudentInput(raw: string): SanitizeResult {
  let clean = raw ?? "";
  const truncated = clean.length > MAX_RESPONSE_LENGTH;
  if (truncated) clean = clean.slice(0, MAX_RESPONSE_LENGTH);

  // Strip characters sometimes used to fake a role/turn boundary inside plain text.
  clean = clean.replace(/```[\s\S]*?system[\s\S]*?```/gi, (m) => m.replace(/system/gi, "[redacted]"));

  const injectionPatterns: Array<[RegExp, string]> = [
    [/ignore (all|any|the) (previous|prior|above) instructions?/i, "instruction_override_attempt"],
    [/you are now/i, "role_reassignment_attempt"],
    [/\bsystem\s*:\s*/i, "fake_role_marker"],
    [/\bassistant\s*:\s*/i, "fake_role_marker"],
    [/reveal (the )?(system prompt|expected[_ ]evidence|answer key|grading criteria)/i, "grading_key_exfiltration_attempt"],
    [/give (me )?(full|100|max(imum)?) (marks|score|credit)/i, "score_manipulation_attempt"],
    [/disregard (the )?(rubric|evaluation)/i, "rubric_override_attempt"],
  ];

  const flaggedPatterns = injectionPatterns
    .filter(([pattern]) => pattern.test(clean))
    .map(([, label]) => label);

  return { clean, truncated, flaggedPatterns };
}

/** Delimiter used to fence untrusted content inside a user turn. Kept unusual to resist spoofing. */
export const DATA_FENCE = {
  open: "<<<STUDENT_DATA_BEGIN>>>",
  close: "<<<STUDENT_DATA_END>>>",
};

export function fenceStudentData(label: string, content: string): string {
  return `${label}\n${DATA_FENCE.open}\n${content}\n${DATA_FENCE.close}`;
}

/** Basic request-shape guard used by every controller before touching the DB or AI layer. */
export function assertNonEmpty(value: string | undefined | null, field: string): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}
