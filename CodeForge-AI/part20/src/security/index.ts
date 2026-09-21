// Security helpers. These are intentionally small and composable rather than
// baked into route handlers, per the "small composable services" principle.

export class ForbiddenError extends Error {}

/**
 * Ownership check for the analyze/reconcile endpoints. Throws ForbiddenError
 * if the requesting user doesn't own the submission. Wire this to your real
 * auth/session + DB lookups — see api/routes.ts for where it's called.
 */
export function assertOwnsSubmission(params: { requestingUserId: string; submissionOwnerId: string }): void {
  if (params.requestingUserId !== params.submissionOwnerId) {
    throw new ForbiddenError("You do not have access to this submission.");
  }
}

/**
 * Defense-in-depth only. The PRIMARY prompt-injection defense is structural:
 * student text is always wrapped in explicit untrusted-content delimiters and
 * kept out of the system prompt (see src/ai/promptTemplates.ts). This helper
 * just flags suspicious content for logging/monitoring so you can see attempts
 * in your observability stack — it must never be used to decide correctness.
 */
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous\s+|prior\s+|above\s+)?instructions/i,
  /you are now/i,
  /system prompt/i,
  /disregard\s+(all|previous|prior|the)/i,
  /give (me|this) (a )?(perfect|100|full) score/i,
  /act as/i,
];

export function flagsPossiblePromptInjection(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((re) => re.test(text));
}
