import type { ActionDecision, Diagnosis, GraphReadiness, InterventionRecord, SkillEvidenceRecord, StuckSignal } from "./types.js";
import { selectNextIntervention } from "./interventionEngine.js";

export interface NextBestActionParams {
  skillId: string;
  diagnosis: Diagnosis;
  evidence: SkillEvidenceRecord;
  readiness: GraphReadiness;
  stuck: StuckSignal;
  priorInterventionsForSkill: InterventionRecord[];
  hasUnexploredDownstream: boolean;
}

/**
 * Rule table straight from Phase 5 / Phase 15, evaluated in a fixed priority
 * order: unmet prerequisite > stuck signal > diagnosed gap. Every branch
 * carries its reason and evidenceRefs forward untouched from the diagnosis
 * or stuck signal that triggered it — nothing here invents prose (Phase 25:
 * "never provide a reason unsupported by evidence").
 */
export function decideNextBestAction(params: NextBestActionParams): ActionDecision {
  const { skillId, diagnosis, evidence, readiness, stuck, priorInterventionsForSkill, hasUnexploredDownstream } = params;

  if (!readiness.isReady && readiness.blockingPrerequisiteId) {
    return {
      actionType: "LEARN",
      targetSkillId: readiness.blockingPrerequisiteId,
      reason: `${skillId} depends on a prerequisite that isn't strong enough yet — strengthening it first, per Phase 26, rather than jumping ahead.`,
      evidenceBasis: ["prerequisite readiness"],
    };
  }

  if (stuck.isStuck) {
    const interventionType = selectNextIntervention(priorInterventionsForSkill);
    return {
      actionType: diagnosis.primaryGap === "MISCONCEPTION" || stuck.signalType === "REPEATED_SAME_ERROR" ? "RELEARN" : "DRILL",
      targetSkillId: skillId,
      reason: `Recent attempts show a stuck signal (${stuck.signalType.toLowerCase().replace(/_/g, " ")}). Changing approach instead of repeating more of the same questions.`,
      evidenceBasis: stuck.evidenceRefs,
      interventionType,
    };
  }

  switch (diagnosis.primaryGap) {
    case "FOUNDATION":
      return {
        actionType: evidence.foundation.attempts === 0 ? "LEARN" : "RELEARN",
        targetSkillId: skillId,
        reason: diagnosis.detail,
        evidenceBasis: diagnosis.evidenceRefs,
      };
    case "APPLICATION":
      return { actionType: "PRACTICE", targetSkillId: skillId, reason: diagnosis.detail, evidenceBasis: diagnosis.evidenceRefs };
    case "TRANSFER":
      return { actionType: "TRANSFER", targetSkillId: skillId, reason: diagnosis.detail, evidenceBasis: diagnosis.evidenceRefs };
    case "SPEED":
      return { actionType: "SPEED_TRAIN", targetSkillId: skillId, reason: diagnosis.detail, evidenceBasis: diagnosis.evidenceRefs };
    case "STALE":
      return { actionType: "REVIEW", targetSkillId: skillId, reason: diagnosis.detail, evidenceBasis: diagnosis.evidenceRefs };
    case "MISCONCEPTION":
      return {
        actionType: "RELEARN",
        targetSkillId: skillId,
        reason: diagnosis.detail,
        evidenceBasis: diagnosis.evidenceRefs,
        interventionType: "CONCEPT_REBUILD",
      };
    case "NONE":
      return {
        actionType: hasUnexploredDownstream ? "ADVANCE" : "REST",
        targetSkillId: skillId,
        reason: hasUnexploredDownstream
          ? "Current evidence supports strong mastery — moving to the next skill in the path."
          : "Current evidence supports strong mastery and there's nothing further queued right now.",
        evidenceBasis: diagnosis.evidenceRefs,
      };
  }
}
