import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { intervention, interventionAssignment } from "../db/schema";
import { THRESHOLDS } from "../config/thresholds";
import { getSkillGaps, largestGap, type SkillGap } from "./skillGapService";
import { getLatestSnapshot } from "./readinessService";

/** Reasonable default mapping from readiness category -> intervention type.
 *  Override per institution by passing a custom map — categories themselves
 *  are open-ended (spec §30), so this only needs entries for categories the
 *  institution actually uses. Unmapped categories fall back to CUSTOM. */
const DEFAULT_CATEGORY_TO_TYPE: Record<string, string> = {
  technical: "TRAINING",
  interview: "MOCK_INTERVIEW",
  communication: "COACHING",
  aptitude: "TRAINING",
  problem_solving: "TRAINING",
  resume: "RESUME_REVIEW",
};

export interface Recommendation {
  studentId: string;
  hasRecommendation: boolean;
  recommendedInterventionType?: string;
  targetCategory?: string;
  reason: string;
  evidence: Record<string, unknown>[];
  priority?: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Rule-based, not LLM-based (spec §18 — "Do not require an LLM to calculate
 * the underlying recommendation"). An LLM layer can narrate this object in
 * natural language later; it must not invent a different number.
 */
export async function recommendIntervention(
  studentId: string,
  institutionId: string,
  categoryToType: Record<string, string> = DEFAULT_CATEGORY_TO_TYPE
): Promise<Recommendation> {
  const gapResult = await getSkillGaps(studentId);

  if (!gapResult.hasData || gapResult.gaps.length === 0) {
    return {
      studentId,
      hasRecommendation: false,
      reason: gapResult.hasData
        ? "No category is currently below its target — no intervention recommended."
        : "Not enough assessment/skill evidence yet to recommend an intervention.",
      evidence: [],
    };
  }

  // Skip categories where the student already has an active assignment of
  // the matching intervention type, so we don't recommend the same thing twice.
  const activeAssignments = await db
    .select({ interventionId: interventionAssignment.interventionId })
    .from(interventionAssignment)
    .where(
      and(
        eq(interventionAssignment.studentId, studentId),
        inArray(interventionAssignment.status, ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"])
      )
    );
  const activeInterventionIds = activeAssignments.map((a) => a.interventionId);
  const activeTypes = activeInterventionIds.length
    ? new Set(
        (
          await db
            .select({ type: intervention.type })
            .from(intervention)
            .where(inArray(intervention.id, activeInterventionIds))
        ).map((i) => i.type)
      )
    : new Set<string>();

  let target: SkillGap | null = null;
  for (const gap of gapResult.gaps) {
    const type = categoryToType[gap.category] ?? "CUSTOM";
    if (!activeTypes.has(type)) {
      target = gap;
      break;
    }
  }

  if (!target) {
    return {
      studentId,
      hasRecommendation: false,
      reason: "All significant gaps already have an active intervention assigned.",
      evidence: gapResult.gaps.map(gapToEvidence),
    };
  }

  const type = categoryToType[target.category] ?? "CUSTOM";
  const snapshot = await getLatestSnapshot(studentId);
  const priority: Recommendation["priority"] =
    target.gap >= THRESHOLDS.HIGH_PRIORITY_GAP || snapshot?.riskLevel === "CRITICAL" || snapshot?.riskLevel === "HIGH"
      ? "HIGH"
      : "MEDIUM";

  return {
    studentId,
    hasRecommendation: true,
    recommendedInterventionType: type,
    targetCategory: target.category,
    reason: `${target.category} readiness is ${target.currentScore}, ${target.gap} points below the ${target.target} target (based on ${target.evidenceCount} data point${target.evidenceCount === 1 ? "" : "s"}).`,
    evidence: [gapToEvidence(target)],
    priority,
  };
}

function gapToEvidence(gap: SkillGap): Record<string, unknown> {
  return {
    category: gap.category,
    currentScore: gap.currentScore,
    target: gap.target,
    gap: gap.gap,
    evidenceCount: gap.evidenceCount,
  };
}
