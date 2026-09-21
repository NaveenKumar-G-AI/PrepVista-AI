import { describe, it, expect } from 'vitest';
import { computeMemoryPriorities } from '../src/engine/priorityEngine';
import { RetentionAssessment } from '../src/types';

function assessment(overrides: Partial<RetentionAssessment> & { skillId: string; skillName: string }): RetentionAssessment & { skillName: string } {
  return {
    studentId: 's1',
    masteryScore: 0.8,
    retentionScore: 0.6,
    memoryState: 'AT_RISK',
    confidence: 'MEDIUM',
    retentionRisk: 0.5,
    trend: 'DECLINING',
    recurringWeakness: false,
    escalationLevel: 0,
    lastEvidenceAt: new Date().toISOString(),
    evidenceCount: 4,
    delayedEvidenceCount: 2,
    currentRecoveryStatus: null,
    explanationKey: 'AT_RISK',
    ...overrides,
  };
}

describe('computeMemoryPriorities', () => {
  it('excludes STABLE and MASTERED skills from priorities, and lists them as stable', () => {
    const result = computeMemoryPriorities({
      assessments: [
        assessment({ skillId: 'percentages', skillName: 'Percentages', memoryState: 'STABLE', retentionRisk: 0.05 }),
        assessment({ skillId: 'time_and_work', skillName: 'Time & Work', memoryState: 'AT_RISK' }),
      ],
      targetImportanceBySkill: {},
    });
    expect(result.stable.map((s) => s.skillId)).toContain('percentages');
    expect(result.priorities.map((p) => p.skillId)).not.toContain('percentages');
    expect(result.priorities.map((p) => p.skillId)).toContain('time_and_work');
  });

  it('caps the number of priorities shown even when many skills need attention', () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      assessment({ skillId: `skill_${i}`, skillName: `Skill ${i}`, memoryState: 'AT_RISK', retentionRisk: 0.3 + i * 0.01 }),
    );
    const result = computeMemoryPriorities({ assessments: many, targetImportanceBySkill: {}, workloadCap: 3 });
    expect(result.priorities).toHaveLength(3);
    expect(result.totalNeedingAttention).toBe(17);
  });

  it('ranks higher target-importance skills above lower-importance ones at similar risk', () => {
    const result = computeMemoryPriorities({
      assessments: [
        assessment({ skillId: 'low_importance', skillName: 'Low importance', retentionRisk: 0.5 }),
        assessment({ skillId: 'high_importance', skillName: 'High importance', retentionRisk: 0.5 }),
      ],
      targetImportanceBySkill: { low_importance: 0.2, high_importance: 0.95 },
    });
    expect(result.priorities[0].skillId).toBe('high_importance');
  });

  it('gives verification-required items a real priority reason and short time estimate', () => {
    const result = computeMemoryPriorities({
      assessments: [
        assessment({
          skillId: 'permutation_combination',
          skillName: 'Permutation & Combination',
          memoryState: 'AT_RISK',
          currentRecoveryStatus: 'AWAITING_DELAYED_VERIFICATION',
        }),
      ],
      targetImportanceBySkill: {},
    });
    expect(result.priorities[0].reason).toBe('VERIFICATION_REQUIRED');
    expect(result.priorities[0].estimatedMinutes).toBeLessThanOrEqual(5);
  });

  it('returns an empty priority list ("no review required") when everything is stable', () => {
    const result = computeMemoryPriorities({
      assessments: [
        assessment({ skillId: 'a', skillName: 'A', memoryState: 'STABLE' }),
        assessment({ skillId: 'b', skillName: 'B', memoryState: 'STABLE' }),
      ],
      targetImportanceBySkill: {},
    });
    expect(result.priorities).toHaveLength(0);
    expect(result.stable).toHaveLength(2);
  });
});
