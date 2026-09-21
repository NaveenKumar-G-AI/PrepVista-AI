import {
  DifficultyLevel,
  EvidenceQualityTier,
  MasteryLevel,
  RoleSkillImportance,
  type EvidenceRecord,
  type EvidenceRequirement,
  type SkillGapEngineInput,
} from "../src/domain/types.js";

export const EVIDENCE_REQS: EvidenceRequirement = {
  minEvidenceCount: 3,
  minDiversity: 2,
  recencyWindowDays: 120,
};

let evidenceCounter = 0;

export function makeEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  evidenceCounter += 1;
  return {
    id: `ev-${evidenceCounter}`,
    skillId: "skill.python",
    studentId: "student-1",
    sourceType: "challenge",
    qualityTier: EvidenceQualityTier.VERIFIED_DIRECT_PERFORMANCE,
    taskId: `task-${evidenceCounter}`,
    difficulty: DifficultyLevel.INTERMEDIATE,
    timestamp: "2026-06-01T00:00:00.000Z",
    outcome: "pass",
    rawScore: 85,
    ...overrides,
  };
}

/** Builds `count` evidence records, one per day going backwards from
 * `latestDaysAgo`, with the given scores (oldest score first). */
export function evidenceSeries(params: {
  skillId: string;
  scores: number[];
  latestDaysAgo: number;
  now?: Date;
  difficulty?: DifficultyLevel;
}): EvidenceRecord[] {
  const now = params.now ?? new Date("2026-08-21T00:00:00.000Z");
  const n = params.scores.length;
  return params.scores.map((score, i) => {
    const daysAgo = params.latestDaysAgo + (n - 1 - i) * 3; // spread out, oldest furthest back
    const ts = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    return makeEvidence({
      skillId: params.skillId,
      taskId: `${params.skillId}-task-${i}`,
      timestamp: ts,
      rawScore: score,
      difficulty: params.difficulty ?? DifficultyLevel.INTERMEDIATE,
    });
  });
}

export function makeSkillInput(overrides: Partial<SkillGapEngineInput> = {}): SkillGapEngineInput {
  return {
    studentId: "student-1",
    organizationId: "org-1",
    roleId: "role.backend-developer",
    roleName: "Backend Developer",
    roleModelVersion: "role-model-v1",
    skillId: "skill.python",
    skillName: "Python",
    importance: RoleSkillImportance.CORE,
    requiredMastery: MasteryLevel.STRONG,
    evidenceRequirements: EVIDENCE_REQS,
    currentMasteryLevel: MasteryLevel.STRONG,
    evidenceRecords: [],
    previousClosureState: null,
    ...overrides,
  };
}
