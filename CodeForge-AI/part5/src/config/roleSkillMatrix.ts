import type { Priority } from '../types.js';

// Roles are data, not code. Adding a new role or re-weighting an existing one
// never touches the recommendation algorithm (Phase 28/29).
export const roles = [
  { id: 'role_swe', name: 'Software Engineer' },
  { id: 'role_backend', name: 'Backend Developer' },
  { id: 'role_frontend', name: 'Frontend Developer' },
  { id: 'role_fullstack', name: 'Full Stack Developer' },
  { id: 'role_data_scientist', name: 'Data Scientist' },
  { id: 'role_ml_engineer', name: 'ML Engineer' },
  { id: 'role_data_engineer', name: 'Data Engineer' },
  { id: 'role_devops', name: 'DevOps Engineer' },
];

export interface RoleSkillEntry {
  roleId: string;
  skillName: string; // resolved to skill_id at seed time
  priority: Priority;
  targetLevel: string;
}

// A representative (not exhaustive) seed. Skill names are resolved against
// the seeded skill graph in scripts/seed.ts. Extend this table freely — the
// engine reads it as data.
export const roleSkillMatrix: RoleSkillEntry[] = [
  // ML Engineer — the example role called out explicitly in the spec.
  { roleId: 'role_ml_engineer', skillName: 'Python', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_ml_engineer', skillName: 'Algorithms', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_ml_engineer', skillName: 'Data Structures', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_ml_engineer', skillName: 'Python Collections', priority: 'VERY_HIGH', targetLevel: 'ADVANCED' },
  { roleId: 'role_ml_engineer', skillName: 'Graph Algorithms', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
  { roleId: 'role_ml_engineer', skillName: 'Recursion', priority: 'MEDIUM', targetLevel: 'COMPETENT' },

  // Backend Developer
  { roleId: 'role_backend', skillName: 'Data Structures', priority: 'VERY_HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_backend', skillName: 'Hash Maps', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_backend', skillName: 'Queues', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
  { roleId: 'role_backend', skillName: 'Graph Algorithms', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
  { roleId: 'role_backend', skillName: 'Dynamic Programming', priority: 'MEDIUM', targetLevel: 'DEVELOPING' },

  // Full Stack Developer
  { roleId: 'role_fullstack', skillName: 'Arrays', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_fullstack', skillName: 'Hash Maps', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_fullstack', skillName: 'Sliding Window', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
  { roleId: 'role_fullstack', skillName: 'Two Pointers', priority: 'MEDIUM', targetLevel: 'COMPETENT' },

  // Software Engineer (general)
  { roleId: 'role_swe', skillName: 'Data Structures', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_swe', skillName: 'Algorithms', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_swe', skillName: 'Recursion', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
  { roleId: 'role_swe', skillName: 'Dynamic Programming', priority: 'MEDIUM', targetLevel: 'COMPETENT' },

  // Data Engineer
  { roleId: 'role_data_engineer', skillName: 'Python', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_data_engineer', skillName: 'Python Collections', priority: 'HIGH', targetLevel: 'STRONG' },
  { roleId: 'role_data_engineer', skillName: 'Arrays', priority: 'MEDIUM', targetLevel: 'COMPETENT' },
];
