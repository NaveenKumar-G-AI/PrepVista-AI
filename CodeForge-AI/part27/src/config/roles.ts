/**
 * Role-aware growth weighting — section 31. This is NOT a role-readiness
 * engine (that stays owned by CodeForge's existing role system, section
 * 32) — it only says which growth *categories* matter more for which
 * role, so growth signals can be summarized in role-relevant language.
 *
 * `categoryWeight` values are relative emphasis, not scores — they're used
 * to sort/label a student's growth profile per role, never to compute an
 * authoritative readiness number.
 */

export type GrowthCategory =
  | 'PROBLEM_SOLVING'
  | 'ALGORITHMIC_REASONING'
  | 'IMPLEMENTATION'
  | 'COMPLEXITY_AWARENESS'
  | 'CODE_QUALITY'
  | 'DEBUGGING'
  | 'TECHNICAL_REASONING'
  | 'UNDERSTANDING'
  | 'TRANSFER'
  | 'RETENTION'
  | 'CODE_REVIEW'
  | 'TECHNICAL_COMMUNICATION'
  | 'ROLE_READINESS';

export interface RoleGrowthProfile {
  roleId: string;
  label: string;
  emphasize: GrowthCategory[];
}

// Adjust freely, or replace with a lookup into CodeForge's existing role
// table — this module never assumes it owns the canonical role list
// (section 31/32), it only needs a roleId string to key off of.
export const roleGrowthProfiles: Record<string, RoleGrowthProfile> = {
  backend: {
    roleId: 'backend',
    label: 'Backend Engineer',
    emphasize: ['IMPLEMENTATION', 'COMPLEXITY_AWARENESS', 'DEBUGGING', 'TECHNICAL_REASONING', 'CODE_QUALITY'],
  },
  ml_engineer: {
    roleId: 'ml_engineer',
    label: 'ML Engineer',
    emphasize: ['PROBLEM_SOLVING', 'TECHNICAL_REASONING', 'UNDERSTANDING', 'IMPLEMENTATION', 'TRANSFER'],
  },
  frontend: {
    roleId: 'frontend',
    label: 'Frontend Engineer',
    emphasize: ['IMPLEMENTATION', 'CODE_QUALITY', 'DEBUGGING', 'UNDERSTANDING'],
  },
};

export function getRoleGrowthProfile(roleId: string | undefined | null): RoleGrowthProfile | null {
  if (!roleId) return null;
  return roleGrowthProfiles[roleId] ?? null;
}
