import type { GrowthInsight, GrowthSnapshot } from "./types.ts";

export interface RequestingSession {
  userId: string;
  isInstructor: boolean;
}

export type AuthorizationResult =
  | { ok: true; studentId: string; asInstructor: boolean }
  | { ok: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" };

/**
 * Decides which student's data a request may see. Never trusts a
 * client-supplied student id on its own — an instructor requesting a
 * student other than themselves must be independently verified as
 * authorized for that specific student (via `isEnrolledInstructor`, a
 * caller-supplied real DB check, not a claim on the request).
 */
export function resolveAuthorizedStudentId(
  session: RequestingSession | null,
  requestedStudentId: string | null,
  isEnrolledInstructor: (instructorId: string, studentId: string) => boolean,
): AuthorizationResult {
  if (!session) return { ok: false, reason: "UNAUTHENTICATED" };

  const target = requestedStudentId ?? session.userId;

  if (target === session.userId) {
    return { ok: true, studentId: target, asInstructor: false };
  }

  if (session.isInstructor && isEnrolledInstructor(session.userId, target)) {
    return { ok: true, studentId: target, asInstructor: true };
  }

  return { ok: false, reason: "FORBIDDEN" };
}

/**
 * Assessment mode must never reveal: per-dimension weaknesses framed as
 * "development areas", raw evidence ids that could hint at which specific
 * problems are still upcoming in the adaptive path, or hidden-scoring
 * detail. It's fine to show that growth tracking exists and is positive —
 * just not the parts that leak what the assessment is still probing for.
 */
export function applyAssessmentModeFilter(insights: GrowthInsight[]): GrowthInsight[] {
  return insights.filter((i) => i.assessmentSafe);
}

export function redactSnapshotForAssessment(snapshot: GrowthSnapshot): GrowthSnapshot {
  return {
    ...snapshot,
    dimensions: snapshot.dimensions.map((d) => ({
      ...d,
      supportingEvidenceIds: [], // no evidence drill-down while an assessment is in progress
    })),
  };
}
