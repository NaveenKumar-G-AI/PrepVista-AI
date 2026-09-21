import { MemoryStateName, InterventionType, RetentionAssessment } from '../types';
import { MemoryPriorityItem } from '../engine/priorityEngine';

/**
 * Contract Feature 24 (Recall) exposes to Feature 22 (Pathfinder).
 * Responsibility boundary, per spec section 43:
 *   Feature 22 decides WHAT the student should do next.
 *   Feature 24 only reports WHAT capability needs to be retained/recovered.
 * No real Pathfinder service exists to call here, so this module only
 * builds the payload and exposes it over GET /pathfinder-signals — a real
 * Feature 22 would be the one polling or subscribing to it.
 */
export interface PathfinderSignal {
  studentId: string;
  retentionStatus: Record<string, MemoryStateName>;
  retentionRisk: Record<string, number>;
  prioritySkills: string[];
  recurringWeaknesses: string[];
  recommendedRecovery: Record<string, InterventionType | null>;
  verificationRequired: string[];
  generatedAt: string;
}

export function buildPathfinderSignal(
  studentId: string,
  assessments: RetentionAssessment[],
  priorities: MemoryPriorityItem[],
  recommendedRecoveryBySkill: Record<string, InterventionType | null>,
): PathfinderSignal {
  const retentionStatus: Record<string, MemoryStateName> = {};
  const retentionRisk: Record<string, number> = {};
  const recurringWeaknesses: string[] = [];
  const verificationRequired: string[] = [];

  assessments.forEach((a) => {
    retentionStatus[a.skillId] = a.memoryState;
    if (a.retentionRisk != null) retentionRisk[a.skillId] = a.retentionRisk;
    if (a.recurringWeakness) recurringWeaknesses.push(a.skillId);
    if (a.currentRecoveryStatus === 'AWAITING_DELAYED_VERIFICATION') verificationRequired.push(a.skillId);
  });

  return {
    studentId,
    retentionStatus,
    retentionRisk,
    prioritySkills: priorities.map((p) => p.skillId),
    recurringWeaknesses,
    recommendedRecovery: recommendedRecoveryBySkill,
    verificationRequired,
    generatedAt: new Date().toISOString(),
  };
}
