import { RetentionAssessment, MemoryStateName } from '../types';
import { RETENTION_CONFIG as CFG } from '../config';

export type PriorityReason = 'AT_RISK' | 'RECURRING_WEAKNESS' | 'VERIFICATION_REQUIRED' | 'DECAYING' | 'FORGOTTEN';

export interface MemoryPriorityItem {
  skillId: string;
  skillName: string;
  reason: PriorityReason;
  priorityScore: number;
  estimatedMinutes: number;
  retentionRisk: number;
  memoryState: MemoryStateName;
}

export interface StableSkillItem {
  skillId: string;
  skillName: string;
}

export interface MemoryPrioritiesResult {
  priorities: MemoryPriorityItem[];
  stable: StableSkillItem[];
  totalNeedingAttention: number;
  estimatedTotalMinutes: number;
}

const NEEDS_ATTENTION_STATES: MemoryStateName[] = ['AT_RISK', 'DECAYING', 'FORGOTTEN'];

function estimateMinutes(reason: PriorityReason): number {
  switch (reason) {
    case 'VERIFICATION_REQUIRED':
      return 3;
    case 'RECURRING_WEAKNESS':
      return 6;
    case 'FORGOTTEN':
      return 7;
    case 'AT_RISK':
      return 5;
    case 'DECAYING':
      return 4;
  }
}

export function computeMemoryPriorities(params: {
  assessments: (RetentionAssessment & { skillName: string })[];
  targetImportanceBySkill: Record<string, number>;
  criticalSkillIds?: string[];
  workloadCap?: number;
}): MemoryPrioritiesResult {
  const cap = params.workloadCap ?? CFG.DEFAULT_WORKLOAD_CAP;
  const critical = new Set(params.criticalSkillIds ?? []);

  const candidates = params.assessments.filter(
    (a) =>
      NEEDS_ATTENTION_STATES.includes(a.memoryState) ||
      a.recurringWeakness ||
      a.currentRecoveryStatus === 'AWAITING_DELAYED_VERIFICATION',
  );

  const scored: MemoryPriorityItem[] = candidates.map((a) => {
    const targetImportance = params.targetImportanceBySkill[a.skillId] ?? 0.5;
    const risk = a.retentionRisk ?? 0.5;

    let reason: PriorityReason = 'AT_RISK';
    if (a.currentRecoveryStatus === 'AWAITING_DELAYED_VERIFICATION') reason = 'VERIFICATION_REQUIRED';
    else if (a.recurringWeakness) reason = 'RECURRING_WEAKNESS';
    else if (a.memoryState === 'FORGOTTEN') reason = 'FORGOTTEN';
    else if (a.memoryState === 'DECAYING') reason = 'DECAYING';

    let score = risk * (CFG.PRIORITY_TARGET_FLOOR + CFG.PRIORITY_TARGET_WEIGHT * targetImportance);
    if (reason === 'RECURRING_WEAKNESS') score += CFG.PRIORITY_RECURRENCE_BONUS;
    if (reason === 'VERIFICATION_REQUIRED') score += CFG.PRIORITY_VERIFICATION_BONUS;
    if (critical.has(a.skillId)) score += CFG.PRIORITY_UPCOMING_ASSESSMENT_BONUS;

    return {
      skillId: a.skillId,
      skillName: a.skillName,
      reason,
      priorityScore: Math.round(score * 1000) / 1000,
      estimatedMinutes: estimateMinutes(reason),
      retentionRisk: risk,
      memoryState: a.memoryState,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  const priorities = scored.slice(0, cap);

  const stable: StableSkillItem[] = params.assessments
    .filter((a) => a.memoryState === 'STABLE' || a.memoryState === 'MASTERED')
    .map((a) => ({ skillId: a.skillId, skillName: a.skillName }));

  return {
    priorities,
    stable,
    totalNeedingAttention: candidates.length,
    estimatedTotalMinutes: priorities.reduce((sum, p) => sum + p.estimatedMinutes, 0),
  };
}
