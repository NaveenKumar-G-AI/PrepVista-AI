import type { GrowthEvidence, GrowthMilestone, MilestoneType, GrowthDimension } from "../types.ts";
import { RULES_VERSION } from "../config.ts";
import { sortByOccurredAt } from "../utils.ts";

/**
 * Every milestone gets a deterministic `milestoneKey` built only from facts
 * that can't change (student, dimension, type, and the ONE evidence row
 * that triggered it). Persisting by this key — not by re-running detection
 * on every request — is what prevents the same milestone from being
 * "discovered" again on a later page load. Callers are expected to upsert
 * on `milestoneKey` and ignore conflicts.
 */
function makeKey(studentId: string, dimension: GrowthDimension, type: MilestoneType, sourceEvidenceId: string): string {
  return `${studentId}:${dimension}:${type}:${sourceEvidenceId}`;
}

function milestone(
  studentId: string,
  dimension: GrowthDimension,
  type: MilestoneType,
  source: GrowthEvidence,
): GrowthMilestone {
  const key = makeKey(studentId, dimension, type, source.evidenceId);
  return {
    milestoneKey: key,
    milestoneId: key,
    studentId,
    dimension,
    milestoneType: type,
    sourceEvidenceId: source.evidenceId,
    occurredAt: source.occurredAt,
    rulesVersion: RULES_VERSION,
  };
}

/**
 * Scans ALL of a student's evidence for one dimension and returns every
 * milestone it can currently detect. This is safe to re-run on the full
 * history each time — dedup happens at persistence time via `milestoneKey`,
 * not by this function trying to remember what it already emitted.
 */
export function detectMilestones(studentId: string, dimension: GrowthDimension, dimensionEvidence: GrowthEvidence[]): GrowthMilestone[] {
  const sorted = sortByOccurredAt(dimensionEvidence);
  const out: GrowthMilestone[] = [];

  const firstIndependentSuccess = sorted.find((e) => e.outcome === "SUCCESS" && (e.assistanceLevel === "NONE" || e.assistanceLevel === "LOW"));
  if (firstIndependentSuccess) out.push(milestone(studentId, dimension, "FIRST_INDEPENDENT_SUCCESS", firstIndependentSuccess));

  const firstTransferSuccess = sorted.find((e) => e.isTransfer && e.outcome === "SUCCESS");
  if (firstTransferSuccess) out.push(milestone(studentId, dimension, "FIRST_TRANSFER_SUCCESS", firstTransferSuccess));

  const firstAdvancedSuccess = sorted.find((e) => e.outcome === "SUCCESS" && e.difficulty === "ADVANCED");
  if (firstAdvancedSuccess) out.push(milestone(studentId, dimension, "FIRST_ADVANCED_SUCCESS", firstAdvancedSuccess));

  if (dimension === "debugging") {
    // Recovery pattern: a failure followed later by a success in the same
    // challenge family — i.e. actually fixing the thing, not just moving on.
    for (let i = 0; i < sorted.length; i++) {
      const failure = sorted[i]!;
      if (failure.outcome !== "FAILURE") continue;
      const laterSuccess = sorted.slice(i + 1).find((e) => e.outcome === "SUCCESS" && e.challengeFamily === failure.challengeFamily);
      if (laterSuccess) {
        out.push(milestone(studentId, dimension, "FIRST_DEBUGGING_RECOVERY", laterSuccess));
        break;
      }
    }
  }

  if (dimension === "complexity_understanding") {
    const improved = sorted.find(
      (e, idx) => e.outcome === "SUCCESS" && idx > 0 && sorted.slice(0, idx).some((prior) => prior.outcome !== "SUCCESS"),
    );
    if (improved) out.push(milestone(studentId, dimension, "COMPLEXITY_IMPROVEMENT", improved));
  }

  if (dimension === "correctness") {
    const consecutive = 3;
    for (let i = consecutive - 1; i < sorted.length; i++) {
      const window = sorted.slice(i - consecutive + 1, i + 1);
      if (window.every((e) => e.outcome === "SUCCESS")) {
        out.push(milestone(studentId, dimension, "CONSISTENT_CORRECTNESS", window[window.length - 1]!));
        break;
      }
    }
  }

  if (dimension === "code_review_ability") {
    const firstGoodResponse = sorted.find((e) => e.outcome === "SUCCESS");
    if (firstGoodResponse) out.push(milestone(studentId, dimension, "SUCCESSFUL_REVIEW_RESPONSE", firstGoodResponse));
  }

  const retentionConfirmed = sorted.find((e) => e.isRetentionCheck && e.outcome === "SUCCESS");
  if (retentionConfirmed) out.push(milestone(studentId, dimension, "RETENTION_CONFIRMED", retentionConfirmed));

  if (dimension.startsWith("role:")) {
    const firstRoleSuccess = sorted.find((e) => e.outcome === "SUCCESS" && e.roleContext);
    if (firstRoleSuccess) out.push(milestone(studentId, dimension, "ROLE_SKILL_MILESTONE", firstRoleSuccess));
  }

  return out;
}
