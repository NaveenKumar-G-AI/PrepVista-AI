import { createHash } from 'crypto';
import { MasteryLevel, ReadinessState } from '../domain/enums';
import type {
  SkillSignalPort,
  RoleReadinessPort,
  GrowthTrackingPort,
  NextBestActionPort,
  StudentSkillSignal,
  StudentRoleReadiness,
  StudentGrowthSample,
  RecommendedAction,
} from './ports';

/**
 * Deterministic mock adapters. NOT real intelligence — they exist so
 * Feature 36 can be developed, demoed, and tested end-to-end before
 * (or without) the real Skill Signal Engine / Role Readiness Engine /
 * Growth Tracking / Next Best Action Engine are wired in. Replace
 * these with real calls to your existing services; the port
 * interfaces in ports.ts are the contract to satisfy.
 *
 * SQL is deliberately given low coverage so the "insufficient
 * evidence" golden scenario (spec section 69) is visible out of the
 * box rather than needing hand-crafted seed data.
 */

const MOCK_SKILLS = [
  { skillId: 'skill_python', skillName: 'Python' },
  { skillId: 'skill_sql', skillName: 'SQL' },
  { skillId: 'skill_dsa', skillName: 'Data Structures' },
  { skillId: 'skill_apis', skillName: 'APIs' },
  { skillId: 'skill_system_design', skillName: 'System Design' },
];

const MOCK_ROLES = [
  { roleId: 'role_backend', roleName: 'Backend Developer' },
  { roleId: 'role_data_analyst', roleName: 'Data Analyst' },
  { roleId: 'role_ml_engineer', roleName: 'ML Engineer' },
];

const ASSESSED_LEVELS = [MasteryLevel.EMERGING, MasteryLevel.DEVELOPING, MasteryLevel.PROFICIENT, MasteryLevel.STRONG];
const READY_STATES = [
  ReadinessState.NEEDS_SIGNIFICANT_PREPARATION,
  ReadinessState.DEVELOPING,
  ReadinessState.NEAR_READY,
  ReadinessState.READY,
];

function seedHash(seed: string): Buffer {
  return createHash('sha1').update(seed).digest();
}

function pick<T>(seed: string, options: T[]): T {
  const hash = seedHash(seed);
  const index = hash[0] % options.length;
  return options[index] as T;
}

function drawBelow(seed: string, threshold: number, byteIndex = 1): boolean {
  const hash = seedHash(seed);
  return (hash[byteIndex] as number) / 255 < threshold;
}

export class MockSkillSignalAdapter implements SkillSignalPort {
  async listKnownSkills() {
    return MOCK_SKILLS;
  }

  async getSkillSignalsForStudents(
    organizationId: string,
    studentIds: string[],
    skillId?: string
  ): Promise<StudentSkillSignal[]> {
    const skills = skillId ? MOCK_SKILLS.filter((s) => s.skillId === skillId) : MOCK_SKILLS;
    const results: StudentSkillSignal[] = [];
    for (const student of studentIds) {
      for (const skill of skills) {
        const seed = `${organizationId}:${student}:${skill.skillId}`;
        const coverageBias = skill.skillId === 'skill_sql' ? 0.2 : 0.75;
        const evidence = drawBelow(seed, coverageBias);
        results.push({
          studentId: student,
          skillId: skill.skillId,
          skillName: skill.skillName,
          level: evidence ? pick(seed, ASSESSED_LEVELS) : MasteryLevel.NOT_ASSESSED,
          hasEvidence: evidence,
          lastAssessedAt: evidence ? new Date() : null,
          sourceVersion: 'mock-skill-signal-v1',
        });
      }
    }
    return results;
  }
}

export class MockRoleReadinessAdapter implements RoleReadinessPort {
  async listSupportedRoles() {
    return MOCK_ROLES;
  }

  async getRoleReadinessForStudents(
    organizationId: string,
    studentIds: string[],
    roleId?: string
  ): Promise<StudentRoleReadiness[]> {
    const roles = roleId ? MOCK_ROLES.filter((r) => r.roleId === roleId) : MOCK_ROLES;
    const results: StudentRoleReadiness[] = [];
    for (const student of studentIds) {
      for (const role of roles) {
        const seed = `${organizationId}:${student}:${role.roleId}`;
        const evidence = drawBelow(seed, 0.6);
        results.push({
          studentId: student,
          roleId: role.roleId,
          roleName: role.roleName,
          state: evidence ? pick(seed, READY_STATES) : ReadinessState.INSUFFICIENT_EVIDENCE,
          hasEvidence: evidence,
          requiredSkillGaps: MOCK_SKILLS.slice(0, 2).map((s) => ({
            skillId: s.skillId,
            skillName: s.skillName,
            deficient: drawBelow(`${seed}:${s.skillId}`, 0.4),
          })),
          sourceVersion: 'mock-role-readiness-v1',
        });
      }
    }
    return results;
  }
}

export class MockGrowthTrackingAdapter implements GrowthTrackingPort {
  async getGrowthSamples(
    organizationId: string,
    studentIds: string[],
    skillId: string,
    periodLabels: string[]
  ): Promise<StudentGrowthSample[]> {
    const results: StudentGrowthSample[] = [];
    for (const student of studentIds) {
      for (const [i, period] of periodLabels.entries()) {
        const seed = `${organizationId}:${student}:${skillId}:${period}`;
        const coverageBias = skillId === 'skill_sql' ? 0.2 : 0.7;
        const evidence = drawBelow(seed, coverageBias);
        const improvementBias = Math.min(coverageBias + i * 0.05, 0.9);
        results.push({
          studentId: student,
          skillId,
          periodLabel: period,
          proficientOrAbove: evidence && drawBelow(`${seed}:proficient`, improvementBias, 2),
          hasEvidence: evidence,
        });
      }
    }
    return results;
  }
}

export class MockNextBestActionAdapter implements NextBestActionPort {
  async getRecommendedFocusAreas(_organizationId: string, _studentIds: string[]): Promise<RecommendedAction[]> {
    return MOCK_SKILLS.map((skill) => ({
      skillId: skill.skillId,
      trainingImpactPotential: skill.skillId === 'skill_sql' ? 0.75 : 0.55,
      reason: `Historically responsive to focused training in ${skill.skillName}.`,
    }));
  }
}
