// Shared domain types. Mirrors db/*/schema.sql exactly — if you change one,
// change the other, and re-run `npm run validate`.

export type ContentStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
export type Importance = 'CORE' | 'IMPORTANT' | 'SUPPORTING' | 'OPTIONAL';
export type Proficiency = 'FOUNDATION' | 'DEVELOPING' | 'COMPETENT' | 'STRONG' | 'ADVANCED';
export type TechnologyType = 'LANGUAGE' | 'FRAMEWORK' | 'LIBRARY' | 'DATABASE' | 'TOOL' | 'PLATFORM';
export type TechnologyUsage = 'COMMON' | 'IMPORTANT' | 'OPTIONAL' | 'SUPPORTING';
export type ContextSource = 'SELF_SELECTED' | 'INSTITUTION_ASSIGNED' | 'AI_RECOMMENDED' | 'IMPORTED';
export type RoleSlot = 'PRIMARY' | 'SECONDARY';

export const PROFICIENCY_ORDER: Proficiency[] = [
  'FOUNDATION',
  'DEVELOPING',
  'COMPETENT',
  'STRONG',
  'ADVANCED',
];

export const PROFICIENCY_DEFINITIONS: Record<Proficiency, string> = {
  FOUNDATION: 'Understands basic concepts with substantial guidance.',
  DEVELOPING: 'Can perform straightforward tasks with occasional support.',
  COMPETENT: 'Can independently perform expected tasks.',
  STRONG: 'Can handle varied problems and explain decisions.',
  ADVANCED: 'Can solve complex or unfamiliar problems and handle trade-offs.',
};

export interface CareerDomain {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ContentStatus;
}

export interface RoleFamily {
  id: string;
  slug: string;
  name: string;
  description: string;
  careerDomainId: string;
  status: ContentStatus;
}

export interface RoleRow {
  id: string;
  slug: string;
  roleFamilyId: string;
  status: ContentStatus;
  currentVersion: number;
}

export interface RoleVersionRow {
  id: string;
  roleId: string;
  version: number;
  name: string;
  shortDescription: string;
  longDescription: string;
  status: ContentStatus;
  publishedAt: string;
}

export interface Competency {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentCompetencyId: string | null;
  status: ContentStatus;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  competencyId: string | null;
  parentSkillId: string | null;
  status: ContentStatus;
}

export interface Technology {
  id: string;
  slug: string;
  name: string;
  type: TechnologyType;
  description: string;
  status: ContentStatus;
}

export interface RoleCompetencyLink {
  competency: Competency;
  importance: Importance;
  expectedProficiency: Proficiency;
  required: boolean;
}

export interface RoleSkillLink {
  skill: Skill;
  importance: Importance;
  expectedProficiency: Proficiency;
  required: boolean;
  prerequisiteLevel: Proficiency | null;
}

export interface RoleTechnologyLink {
  technology: Technology;
  usageType: TechnologyUsage;
}

// Fully assembled role detail — this is what getRoleRequirements(roleId)
// returns to future consumers (Step 38-40).
export interface RoleDetail {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  status: ContentStatus;
  version: number;
  family: { slug: string; name: string };
  domain: { slug: string; name: string };
  competencies: RoleCompetencyLink[];
  skills: RoleSkillLink[];
  technologies: RoleTechnologyLink[];
}

export interface RoleSummary {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  status: ContentStatus;
  family: { slug: string; name: string };
  domain: { slug: string; name: string };
  topAreas: string[]; // 3-5 headline competency names, for cards
}

export interface StudentCareerContext {
  studentId: string;
  primaryRoleId: string;
  primaryRoleVersion: number;
  secondaryRoleId: string | null;
  secondaryRoleVersion: number | null;
  source: ContextSource;
  selectedAt: string;
  updatedAt: string;
}

export interface StudentRoleHistoryEntry {
  id: string;
  studentId: string;
  roleId: string;
  roleVersion: number;
  slot: RoleSlot;
  source: ContextSource;
  startedAt: string;
  endedAt: string | null;
}
