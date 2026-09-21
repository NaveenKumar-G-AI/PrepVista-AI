import { calculateConfidence } from "./confidence";
import type { EvidenceRef, SkillObservation } from "./types";

export type MilestoneType =
  | "FIRST_VERIFIED_MASTERY"
  | "FIRST_ADVANCED_CHALLENGE"
  | "FIRST_TRANSFER_SUCCESS"
  | "DEBUGGING_MILESTONE"
  | "COMPLEXITY_MILESTONE"
  | "ROLE_SKILL_MILESTONE"
  | "ASSESSMENT_IMPROVEMENT";

export interface Milestone {
  type: MilestoneType;
  skillId: string;
  achievedAt: string;
  evidenceIds: string[];
  description: string;
}

const MASTERY_THRESHOLD = 80;
const ROLE_SKILL_THRESHOLD = 70;
const DEBUGGING_MILESTONE_DISTINCT_FAMILIES = 3;
const ASSESSMENT_IMPROVEMENT_THRESHOLD = 10;

function byEvidenceTime(a: EvidenceRef, b: EvidenceRef): number {
  return new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime();
}

/**
 * Evaluates every milestone rule against a skill's full observation
 * history. Every milestone returned carries the evidence IDs that earned
 * it — nothing here is awarded for activity alone (see DEBUGGING_MILESTONE,
 * which requires distinct problem families, not just N attempts).
 */
export function detectMilestones(
  skillId: string,
  observationsChronological: SkillObservation[]
): Milestone[] {
  const milestones: Milestone[] = [];
  if (observationsChronological.length === 0) return milestones;

  const sortedObs = [...observationsChronological].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );
  const allEvidence = sortedObs.flatMap((o) => o.evidence).sort(byEvidenceTime);

  // FIRST_VERIFIED_MASTERY — crossing the mastery bar with HIGH confidence,
  // not just a single high score.
  const masteryObs = sortedObs.find(
    (o) => o.value >= MASTERY_THRESHOLD && calculateConfidence(o) === "HIGH"
  );
  if (masteryObs) {
    milestones.push({
      type: "FIRST_VERIFIED_MASTERY",
      skillId,
      achievedAt: masteryObs.observedAt,
      evidenceIds: masteryObs.evidence.map((e) => e.id),
      description: `Reached verified mastery (score ${masteryObs.value}) backed by high-confidence evidence.`,
    });
  }

  // FIRST_ADVANCED_CHALLENGE — an attempt that succeeded, not just an attempt.
  const firstAdvanced = allEvidence.find(
    (e) => (e.difficulty === "ADVANCED" || e.difficulty === "EXPERT") && e.successful !== false
  );
  if (firstAdvanced) {
    milestones.push({
      type: "FIRST_ADVANCED_CHALLENGE",
      skillId,
      achievedAt: firstAdvanced.observedAt,
      evidenceIds: [firstAdvanced.id],
      description: "Successfully completed a challenge above intermediate difficulty.",
    });
  }

  // FIRST_TRANSFER_SUCCESS — the name says it: it must have succeeded.
  const firstTransfer = allEvidence.find((e) => e.isTransfer && e.successful !== false);
  if (firstTransfer) {
    milestones.push({
      type: "FIRST_TRANSFER_SUCCESS",
      skillId,
      achievedAt: firstTransfer.observedAt,
      evidenceIds: [firstTransfer.id],
      description: "Successfully applied the skill in an unfamiliar context.",
    });
  }

  // DEBUGGING_MILESTONE — independent success across distinct problem families,
  // specifically to resist being farmed by repeating one easy bug pattern.
  const debuggingEvidence = allEvidence.filter(
    (e) => e.type === "DEBUGGING_TASK" && e.successful !== false
  );
  const seenFamilies = new Set<string>();
  const qualifying: EvidenceRef[] = [];
  for (const e of debuggingEvidence) {
    if (e.problemFamily && !seenFamilies.has(e.problemFamily)) {
      seenFamilies.add(e.problemFamily);
      qualifying.push(e);
    }
    if (qualifying.length >= DEBUGGING_MILESTONE_DISTINCT_FAMILIES) break;
  }
  if (qualifying.length >= DEBUGGING_MILESTONE_DISTINCT_FAMILIES) {
    milestones.push({
      type: "DEBUGGING_MILESTONE",
      skillId,
      achievedAt: qualifying[qualifying.length - 1]!.observedAt,
      evidenceIds: qualifying.map((e) => e.id),
      description: `Independently debugged issues across ${qualifying.length} distinct problem families.`,
    });
  }

  // COMPLEXITY_MILESTONE — correct complexity reasoning, not just a fast runtime.
  const complexityEvidence = allEvidence.find(
    (e) =>
      e.demonstratesComplexityReasoning &&
      (e.difficulty === "ADVANCED" || e.difficulty === "EXPERT")
  );
  if (complexityEvidence) {
    milestones.push({
      type: "COMPLEXITY_MILESTONE",
      skillId,
      achievedAt: complexityEvidence.observedAt,
      evidenceIds: [complexityEvidence.id],
      description: "Demonstrated correct complexity reasoning on an advanced-difficulty problem.",
    });
  }

  // ROLE_SKILL_MILESTONE — first time a role-relevant skill clears the bar.
  const roleObs = sortedObs.find(
    (o) => (o.roleRelevance ?? 0) >= 0.7 && o.value >= ROLE_SKILL_THRESHOLD
  );
  if (roleObs) {
    milestones.push({
      type: "ROLE_SKILL_MILESTONE",
      skillId,
      achievedAt: roleObs.observedAt,
      evidenceIds: roleObs.evidence.map((e) => e.id),
      description: `Cleared the proficiency bar on a role-relevant skill (score ${roleObs.value}).`,
    });
  }

  // ASSESSMENT_IMPROVEMENT — formal assessment-to-assessment gain, not practice noise.
  const assessmentObs = sortedObs.filter((o) => o.sourceType === "ASSESSMENT");
  for (let i = 1; i < assessmentObs.length; i++) {
    const prev = assessmentObs[i - 1]!;
    const curr = assessmentObs[i]!;
    const delta = Math.round((curr.value - prev.value) * 10) / 10;
    if (delta >= ASSESSMENT_IMPROVEMENT_THRESHOLD) {
      milestones.push({
        type: "ASSESSMENT_IMPROVEMENT",
        skillId,
        achievedAt: curr.observedAt,
        evidenceIds: curr.evidence.map((e) => e.id),
        description: `Formal assessment score improved by ${delta} points since the previous assessment.`,
      });
    }
  }

  return milestones;
}
