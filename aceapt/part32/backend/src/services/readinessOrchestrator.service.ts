import type { ReadinessRepository } from "../data/repository.js";
import type { ExplanationProvider } from "./explanation.service.js";
import { computeCapabilityGaps } from "./gapAnalysis.service.js";
import { buildRecommendations } from "./recommendation.service.js";
import { logEvent } from "./event.service.js";
import { getRoleRubric } from "../config/rubrics.js";
import type { ReadinessState } from "../types/domain.js";

/**
 * Recomputes ReadinessState fresh on every read rather than caching a
 * stored copy. At this data scale that's simpler and can't go stale;
 * see README "Performance" for the caching strategy to add once this
 * is backed by a real student population (spec section 21: measure
 * before optimizing).
 */
export async function getReadinessState(
  repository: ReadinessRepository,
  explanationProvider: ExplanationProvider,
  studentId: string,
  options: { logEvents?: boolean } = {},
): Promise<ReadinessState> {
  const { logEvents = false } = options;

  let student = await repository.getStudent(studentId);
  if (!student) {
    student = { studentId, displayName: studentId, targetRoleId: null, updatedAt: new Date().toISOString() };
    await repository.upsertStudent(student);
  }

  if (logEvents) {
    await logEvent(repository, studentId, "FEATURE_OPENED");
  }

  if (!student.targetRoleId) {
    return {
      studentId,
      status: "NO_TARGET_ROLE",
      targetRoleId: null,
      targetRoleName: null,
      gaps: [],
      recommendations: { doFirst: [], doNext: [], optional: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  const rubric = getRoleRubric(student.targetRoleId);
  if (!rubric) {
    // Defensive: a stored role id that no longer matches known reference
    // data. Treat like no role set rather than crashing the feature.
    return {
      studentId,
      status: "NO_TARGET_ROLE",
      targetRoleId: null,
      targetRoleName: null,
      gaps: [],
      recommendations: { doFirst: [], doNext: [], optional: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  const [attempts, recentEvents] = await Promise.all([
    repository.getAttempts(studentId),
    repository.getEvents(studentId, 100),
  ]);

  const gaps = computeCapabilityGaps(rubric, attempts);
  const totalEvidence = gaps.reduce((sum, g) => sum + g.evidenceCount, 0);

  if (totalEvidence === 0) {
    return {
      studentId,
      status: "INSUFFICIENT_DATA",
      targetRoleId: rubric.roleId,
      targetRoleName: rubric.roleName,
      gaps,
      recommendations: { doFirst: [], doNext: [], optional: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  const recommendations = await buildRecommendations(gaps, explanationProvider, recentEvents);

  if (logEvents) {
    await logEvent(repository, studentId, "ANALYSIS_COMPLETED", {
      gapCount: gaps.length,
      doFirstCount: recommendations.doFirst.length,
    });
  }

  return {
    studentId,
    status: "READY",
    targetRoleId: rubric.roleId,
    targetRoleName: rubric.roleName,
    gaps,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}
