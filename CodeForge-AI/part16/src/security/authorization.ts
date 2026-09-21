import type { CorrectnessAssessment } from "../domain/types.js";

export class AuthorizationError extends Error {
  constructor(message = "Not authorized to access this resource") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * The ONLY source of truth for "who owns this submission" that the API
 * layer is allowed to use. Implementations MUST look this up from the
 * host app's own submissions table (or auth/session context) server-side
 * — this is the seam where CodeForge's *existing* submission ownership
 * model plugs in; it deliberately does not reimplement it.
 *
 * SECURITY: handlers must call this and compare against the
 * server-derived requester identity BEFORE calling into the repository —
 * never trust a submissionId/userId pair supplied directly by the client
 * without this check (see spec SECURITY section: "Never trust
 * client-provided user_id / submission_id / ...").
 */
export interface SubmissionOwnershipLookup {
  getSubmissionOwnerId(submissionId: string): Promise<string | null>;
}

/**
 * Throws AuthorizationError if `requesterUserId` does not own
 * `submissionId`, or if the submission doesn't exist (same error either
 * way — do not leak whether a submission id exists to an unauthorized
 * caller).
 */
export async function assertOwnsSubmission(
  lookup: SubmissionOwnershipLookup,
  submissionId: string,
  requesterUserId: string
): Promise<void> {
  const ownerId = await lookup.getSubmissionOwnerId(submissionId);
  if (!ownerId || ownerId !== requesterUserId) {
    throw new AuthorizationError();
  }
}

/** Same check, applied to an already-loaded assessment (cheaper — no extra lookup). */
export function assertOwnsAssessment(assessment: CorrectnessAssessment, requesterUserId: string): void {
  if (assessment.ref.userId !== requesterUserId) {
    throw new AuthorizationError();
  }
}
