/**
 * Placeholder shapes for entities that ALREADY EXIST elsewhere in ACEAPT
 * (owned by Features 34-40 and core student/goal/skill data).
 *
 * Feature 41 does not own or duplicate these tables. This file exists so the
 * rest of this module type-checks and is demonstrable in isolation. Delete
 * this file once wired to your real app and import your real types instead —
 * then update src/repositories/*.ts accordingly.
 */

export type ID = string;

export interface Student {
  id: ID;
  name?: string;
}

export interface Goal {
  id: ID;
  studentId: ID;
  targetRole: string;
  requiredSkills: string[]; // skill tags required for this role
  createdAt: string;
  active: boolean;
}

export interface Skill {
  id: ID;
  name: string;
  level: 'novice' | 'developing' | 'proficient' | 'strong';
  lastAssessedAt?: string;
}

export interface Evidence {
  id: ID;
  type: 'project' | 'certification' | 'assessment' | 'work_sample';
  title: string;
  skillTags: string[];
  strength: 'weak' | 'moderate' | 'strong';
  createdAt: string;
}

export interface Opportunity {
  id: ID;
  title: string;
  type: 'internship' | 'job' | 'competition' | 'other';
  relevanceToGoal: number; // 0..1, provided by Feature 39 (Opportunity Intelligence)
  deadline?: string;
  applied: boolean;
}

export type OutcomeTag =
  | 'technical_knowledge_gap'
  | 'communication_gap'
  | 'confidence_gap'
  | 'resume_mismatch'
  | 'role_mismatch';

export interface ApplicationRecord {
  id: ID;
  opportunityId: ID;
  status: 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  appliedAt: string;
  outcomeTags?: OutcomeTag[];
}

export interface DecisionRecord {
  id: ID;
  studentId: ID;
  question: string;
  optionsConsidered: string[];
  chosenOption?: string;
  /** Set when a decision implies a different target role than the active goal. */
  impliedTargetRole?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface OutcomeRecord {
  id: ID;
  relatedType: 'action' | 'decision' | 'experiment' | 'application';
  relatedId: ID;
  expected?: string;
  actual?: string;
  positive?: boolean;
  recordedAt: string;
}

export interface ConstraintRecord {
  id: ID;
  studentId: ID;
  type: 'time' | 'budget' | 'location' | 'schedule' | 'other';
  description: string;
  hoursPerWeek?: number;
}

export interface PriorityWeights {
  income?: number;
  experience?: number;
  learning?: number;
  stability?: number;
  location?: number;
  flexibility?: number;
  entrepreneurship?: number;
  higherStudies?: number;
  careerAcceleration?: number;
}
