import type { InterventionRecord, InterventionType } from "./types.js";

/**
 * Phase 16's sequence and Phase 50's strategy transitions, unified into one
 * ordered list. selectNextIntervention always moves forward one step from
 * whatever was tried last for this student+skill — it never randomly cycles
 * (Phase 50: "Use evidence. Do not randomly cycle strategies.").
 */
export const ESCALATION_SEQUENCE: InterventionType[] = [
  "CONCEPT_REBUILD",
  "EXAMPLE_FIRST",
  "STEP_BY_STEP",
  "GUIDED_PRACTICE",
  "PREREQUISITE_REVIEW",
  "TARGETED_DRILL",
  "VERIFICATION",
];

export function selectNextIntervention(priorInterventionsForSkill: InterventionRecord[]): InterventionType {
  if (priorInterventionsForSkill.length === 0) return ESCALATION_SEQUENCE[0];
  const last = priorInterventionsForSkill[priorInterventionsForSkill.length - 1];
  const lastIndex = ESCALATION_SEQUENCE.indexOf(last.type);
  const nextIndex = Math.min(lastIndex + 1, ESCALATION_SEQUENCE.length - 1);
  return ESCALATION_SEQUENCE[nextIndex];
}

export function interventionSequenceIndex(type: InterventionType): number {
  return ESCALATION_SEQUENCE.indexOf(type);
}

const INTERVENTION_LABEL: Record<InterventionType, string> = {
  CONCEPT_REBUILD: "rebuilding the core concept from scratch",
  EXAMPLE_FIRST: "walking through a worked example before practice",
  STEP_BY_STEP: "breaking the process into explicit steps",
  GUIDED_PRACTICE: "guided practice with support at each step",
  TARGETED_DRILL: "a short, focused drill on the specific gap",
  APPLICATION_PRACTICE: "applying the concept to new problems",
  TRANSFER_PRACTICE: "practicing with unfamiliar variants",
  SPEED_TRAINING: "timed practice to build speed",
  PREREQUISITE_REVIEW: "a quick review of the prerequisite skill",
  RETENTION_REVIEW: "a review to refresh a skill that's gone stale",
  VERIFICATION: "a verification check to confirm the skill has landed",
};

export function describeIntervention(type: InterventionType): string {
  return INTERVENTION_LABEL[type];
}
