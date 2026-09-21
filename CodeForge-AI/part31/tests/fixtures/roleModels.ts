import type { Difficulty, EvidenceRecord, EvidenceStrengthTier, RoleModel } from '../../src/domain/types';

export const BACKEND_DEVELOPER_ROLE: RoleModel = {
  roleId: 'role_backend_dev',
  roleName: 'Backend Developer',
  version: 'role-model-v1',
  skills: [
    {
      skillId: 'skill_programming',
      skillName: 'Programming Fundamentals',
      importance: 'core',
      minimumMastery: 'strong',
      evidenceRequirement: { minEvidenceCount: 3, minTier: 'verified_understanding' },
    },
    {
      skillId: 'skill_debugging',
      skillName: 'Debugging',
      importance: 'core',
      minimumMastery: 'competent',
      evidenceRequirement: { minEvidenceCount: 3, minTier: 'verified_understanding' },
    },
    {
      skillId: 'skill_sql',
      skillName: 'SQL',
      importance: 'important',
      minimumMastery: 'competent',
      evidenceRequirement: { minEvidenceCount: 2, minTier: 'verified_understanding' },
    },
    {
      skillId: 'skill_api_design',
      skillName: 'API Design',
      importance: 'important',
      minimumMastery: 'developing',
      evidenceRequirement: { minEvidenceCount: 2, minTier: 'reasoning_consistency' },
    },
    {
      skillId: 'skill_system_design',
      skillName: 'System Design',
      importance: 'supporting',
      minimumMastery: 'developing',
      evidenceRequirement: { minEvidenceCount: 1, minTier: 'reasoning_consistency' },
    },
    {
      skillId: 'skill_graphql',
      skillName: 'GraphQL',
      importance: 'optional',
      minimumMastery: 'developing',
      evidenceRequirement: { minEvidenceCount: 1, minTier: 'weak_indirect' },
    },
  ],
};

let idCounter = 0;

export function ev(skillId: string, rawScore: number, opts: Partial<EvidenceRecord> = {}): EvidenceRecord {
  idCounter += 1;
  return {
    id: `ev_${idCounter}`,
    skillId,
    rawScore,
    tier: opts.tier ?? ('verified_direct_performance' as EvidenceStrengthTier),
    difficulty: opts.difficulty ?? ('medium' as Difficulty),
    taskType: opts.taskType ?? 'challenge',
    challengeId: opts.challengeId,
    timestamp: opts.timestamp ?? '2026-07-15T00:00:00Z',
    verified: opts.verified ?? true,
    sourceSystem: opts.sourceSystem ?? 'skill_signal_engine',
  };
}

/** Generates N pieces of strong, diverse, recent, stable evidence for a skill. */
export function strongEvidence(skillId: string, count = 5, baseScore = 88): EvidenceRecord[] {
  const taskTypes = ['challenge', 'debugging_task', 'code_review', 'reasoning_check'];
  const difficulties: Difficulty[] = ['medium', 'hard', 'hard', 'expert'];
  const days = [2, 6, 12, 20, 28, 35];
  return Array.from({ length: count }, (_, i) =>
    ev(skillId, baseScore + ((i % 3) - 1) * 3, {
      tier: 'verified_direct_performance',
      difficulty: difficulties[i % difficulties.length],
      taskType: taskTypes[i % taskTypes.length],
      timestamp: daysAgo(days[i % days.length]),
    }),
  );
}

/** Generates N pieces of adequate (not spectacular) evidence — enough to pass a moderate bar. */
export function adequateEvidence(skillId: string, count = 2, baseScore = 72): EvidenceRecord[] {
  return Array.from({ length: count }, (_, i) =>
    ev(skillId, baseScore, {
      tier: 'verified_understanding',
      difficulty: 'medium',
      taskType: i === 0 ? 'challenge' : 'reasoning_check',
      timestamp: daysAgo(10 + i * 7),
    }),
  );
}

/** Generates evidence with high variance (unstable performance) at a given average level. */
export function unstableEvidence(skillId: string, scores: number[]): EvidenceRecord[] {
  return scores.map((score, i) =>
    ev(skillId, score, {
      tier: 'verified_direct_performance',
      difficulty: 'medium',
      taskType: 'challenge',
      timestamp: daysAgo(i * 5),
    }),
  );
}

export function daysAgo(n: number, from = '2026-08-01T00:00:00Z'): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

export const NOW = new Date('2026-08-01T00:00:00Z');
