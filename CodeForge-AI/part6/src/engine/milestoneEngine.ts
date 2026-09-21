import { MILESTONE_COMPLETION_DEFAULTS } from '../config';
import type { EvidenceEvent, MilestoneCompletionConditions, MilestoneStatus, RoadmapSkill } from '../domain/types';

export function defaultCompletionConditions(): MilestoneCompletionConditions {
  return { ...MILESTONE_COMPLETION_DEFAULTS };
}

export interface MilestoneEvaluation {
  complete: boolean;
  readyForVerification: boolean;
  unmet: string[];
}

/**
 * Evaluates a milestone's real completion conditions against real data.
 * Explicitly NOT based on: lessons viewed, challenges opened, or raw
 * question count (Phase 13). A milestone is complete only when its required
 * skills are individually at target mastery, confidence is sufficient,
 * there's enough independent evidence, and — if configured — at least one
 * VERIFICATION-source, independent SUCCESS exists among its skills.
 */
export function evaluateMilestone(
  skills: RoadmapSkill[],
  conditions: MilestoneCompletionConditions,
  evidenceBySkill: Map<string, EvidenceEvent[]>
): MilestoneEvaluation {
  const unmet: string[] = [];
  const requiredSkills = skills.filter((s) => s.required);

  if (conditions.requiredSkillsAtTarget) {
    const notAtTarget = requiredSkills.filter((s) => s.gapStatus !== 'COMPLETE');
    if (notAtTarget.length > 0) {
      unmet.push(`${notAtTarget.length} required skill(s) not yet at target mastery: ${notAtTarget.map((s) => s.skillName).join(', ')}`);
    }
  }

  for (const s of requiredSkills) {
    const evidence = evidenceBySkill.get(s.skillId) ?? [];
    const independentCount = evidence.filter((e) => e.independent).length;
    if (independentCount < conditions.minIndependentEvidencePerRequiredSkill) {
      unmet.push(
        `${s.skillName} has ${independentCount} independent evidence event(s), needs ${conditions.minIndependentEvidencePerRequiredSkill}`
      );
    }
  }

  let hasVerificationPass = false;
  for (const s of requiredSkills) {
    const evidence = evidenceBySkill.get(s.skillId) ?? [];
    if (evidence.some((e) => e.source === 'VERIFICATION' && e.independent && e.outcome === 'SUCCESS')) {
      hasVerificationPass = true;
      break;
    }
  }
  if (conditions.verificationRequired && !hasVerificationPass) {
    unmet.push('no independent VERIFICATION-source success recorded for this milestone yet');
  }

  const complete = unmet.length === 0;
  const readyForVerification =
    !complete &&
    requiredSkills.every((s) => s.gapStatus === 'COMPLETE' || s.gapStatus === 'DEVELOPING') &&
    !hasVerificationPass;

  return { complete, readyForVerification, unmet };
}

/**
 * Status transition: LOCKED -> AVAILABLE only once prerequisite milestones
 * are COMPLETED; AVAILABLE/IN_PROGRESS -> READY_FOR_VERIFICATION /
 * COMPLETED based on evaluateMilestone(); a milestone whose skill set just
 * changed (e.g. a prerequisite was inserted) goes to NEEDS_REASSESSMENT
 * rather than silently staying COMPLETED.
 */
export function nextMilestoneStatus(
  current: MilestoneStatus,
  prerequisiteMilestonesCompleted: boolean,
  evaluation: MilestoneEvaluation,
  skillSetChanged: boolean
): MilestoneStatus {
  if (current === 'COMPLETED' && skillSetChanged) return 'NEEDS_REASSESSMENT';
  if (!prerequisiteMilestonesCompleted) return 'LOCKED';
  if (evaluation.complete) return 'COMPLETED';
  if (evaluation.readyForVerification) return 'READY_FOR_VERIFICATION';
  if (current === 'LOCKED' || current === 'COMPLETED') return 'AVAILABLE';
  return current === 'NEEDS_REASSESSMENT' ? 'IN_PROGRESS' : current;
}
