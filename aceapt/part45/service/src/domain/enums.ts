import { z } from 'zod';

export const DOMAINS = ['QUANTITATIVE_APTITUDE', 'LOGICAL_REASONING', 'VERBAL_APTITUDE'] as const;
export type Domain = (typeof DOMAINS)[number];

export const SKILL_LEVELS = ['DOMAIN', 'CATEGORY', 'SKILL', 'SUBSKILL', 'MICRO_CAPABILITY'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const RELATIONSHIP_TYPES = [
  'PREREQUISITE',
  'DEPENDS_ON',
  'RELATED_TO',
  'BUILDS',
  'TRANSFER_TO',
  'PART_OF',
  'COMMON_ERROR_SOURCE',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * Relationship types that represent a directed "upstream supports downstream"
 * dependency and therefore participate in prerequisite traversal and cycle
 * detection. RELATED_TO, TRANSFER_TO and COMMON_ERROR_SOURCE are associative
 * signals, not ordering constraints, and are excluded (section 21).
 */
export const DEPENDENCY_RELATIONSHIP_TYPES: RelationshipType[] = ['PREREQUISITE', 'DEPENDS_ON', 'BUILDS', 'PART_OF'];

export const RELATIONSHIP_SOURCES = [
  'CURRICULUM',
  'EXPERT_AUTHORED',
  'VALIDATED_ASSESSMENT_DATA',
  'EMPIRICAL_DATA',
  'AI_SUGGESTED',
] as const;
export type RelationshipSource = (typeof RELATIONSHIP_SOURCES)[number];

export const GRAPH_STATUSES = ['DRAFT', 'REVIEW', 'VALIDATED', 'PUBLISHED', 'ARCHIVED'] as const;
export type GraphStatus = (typeof GRAPH_STATUSES)[number];

/** Section 23: "never attempted" must never collapse into "weak". */
export const SKILL_STATES = ['UNKNOWN', 'DEVELOPING', 'STRONG', 'MASTERED', 'MAINTENANCE'] as const;
export type SkillState = (typeof SKILL_STATES)[number];

export const EVIDENCE_CONFIDENCE = ['NONE', 'LOW', 'MODERATE', 'HIGH'] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE)[number];

export const TRENDS = ['IMPROVING', 'DECLINING', 'STABLE'] as const;
export type Trend = (typeof TRENDS)[number];

export const EVIDENCE_EVENT_TYPES = [
  'DIAGNOSTIC',
  'PRACTICE',
  'ASSESSMENT',
  'MISTAKE',
  'MASTERY_CHECK',
  'RETENTION_CHECK',
] as const;
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];

export const zDomain = z.enum(DOMAINS);
export const zSkillLevel = z.enum(SKILL_LEVELS);
export const zRelationshipType = z.enum(RELATIONSHIP_TYPES);
export const zRelationshipSource = z.enum(RELATIONSHIP_SOURCES);
export const zGraphStatus = z.enum(GRAPH_STATUSES);
export const zSkillState = z.enum(SKILL_STATES);
export const zEvidenceConfidence = z.enum(EVIDENCE_CONFIDENCE);
export const zTrend = z.enum(TRENDS);
export const zEvidenceEventType = z.enum(EVIDENCE_EVENT_TYPES);

/** Section 14: stable machine identifiers, e.g. "QUANT.PERCENTAGES" — never a display name. */
export const SKILL_CODE_PATTERN = /^[A-Z]+(\.[A-Z0-9_]+)+$/;
export const zSkillCode = z.string().regex(SKILL_CODE_PATTERN, 'Skill code must look like DOMAIN.SKILL_NAME');
