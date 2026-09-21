// ============================================================
// INTERVENTION MEMORY (spec §20, §21, §42, §43, §44)
//
// Feature 21 doesn't own this data — Feature 16 does. These are
// thin helpers over the Feature16InterventionRecovery adapter for
// the two things the engine needs repeatedly: an indexed view of
// "what's already been tried, per skill" (for escalation) and "what
// was tried most recently, across skills" (for the diversity nudge).
// ============================================================

import { ActionType, InterventionRecord, SkillId, StudentId } from './types';
import { Feature16InterventionRecovery } from './upstreamAdapters';

export function loadPastInterventionsBySkill(
  provider: Feature16InterventionRecovery,
  studentId: StudentId,
  skillIds: SkillId[]
): Map<SkillId, InterventionRecord[]> {
  const map = new Map<SkillId, InterventionRecord[]>();
  for (const skillId of skillIds) {
    map.set(skillId, provider.getPastInterventions(studentId, skillId));
  }
  return map;
}

/** Most-recent-first action types across every skill in the map — feeds the action-diversity nudge (§42). */
export function recentActionTypes(pastInterventionsBySkill: Map<SkillId, InterventionRecord[]>, limit = 5): ActionType[] {
  const all = [...pastInterventionsBySkill.values()].flat();
  return all
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
    .map((iv) => iv.actionType);
}

/** All completed, verified interventions — feeds a "recent wins" / history view (§20, §32). */
export function getVerifiedHistory(pastInterventionsBySkill: Map<SkillId, InterventionRecord[]>): InterventionRecord[] {
  return [...pastInterventionsBySkill.values()]
    .flat()
    .filter((iv) => iv.outcome !== 'PENDING' && iv.verifiedAt)
    .sort((a, b) => (b.verifiedAt ?? '').localeCompare(a.verifiedAt ?? ''));
}

/**
 * Records a fresh recommendation as PENDING so a later pipeline run can
 * verify it (the write side of the Feature 16 contract). Call this once
 * the student actually starts the action, not merely when it's shown to
 * them — recommending isn't the same as attempting (spec §20, §31).
 */
export function recordPendingIntervention(
  provider: Feature16InterventionRecovery,
  args: {
    id: string;
    studentId: StudentId;
    skillId: SkillId;
    diagnosisCategory: InterventionRecord['diagnosisCategory'];
    actionType: ActionType;
    beforeMetric?: number;
  }
): void {
  provider.recordInterventionOutcome({
    id: args.id,
    studentId: args.studentId,
    skillId: args.skillId,
    diagnosisCategory: args.diagnosisCategory,
    actionType: args.actionType,
    startedAt: new Date().toISOString(),
    beforeMetric: args.beforeMetric,
    outcome: 'PENDING',
  });
}
