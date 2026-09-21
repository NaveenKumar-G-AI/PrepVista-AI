/**
 * Growth events — section 28. Discrete, evidence-linked, explainable facts
 * about a change in a student's skill state. These are what the timeline
 * (section 38) and downstream systems (adaptive path, section 76) consume.
 *
 * Events are append-only. A correction is a new event, never an edit.
 */

export type GrowthEventType =
  | 'SKILL_ACQUIRED'
  | 'SKILL_IMPROVED'
  | 'SKILL_MASTERED'
  | 'SKILL_REGRESSED'
  | 'SKILL_RECOVERED'
  | 'TRANSFER_CONFIRMED'
  | 'RETENTION_CONFIRMED'
  | 'BOTTLENECK_IDENTIFIED'
  | 'MILESTONE_REACHED'
  | 'ROLE_READINESS_IMPROVED';

export interface GrowthEvent {
  eventId: string;
  studentId: string;
  skillId: string | null; // null for student-level events like BOTTLENECK_IDENTIFIED across skills
  eventType: GrowthEventType;
  timestamp: string;
  evidenceRefs: string[];
  confidence: import('./skill-state.js').ConfidenceLevel;
  previousState: import('./skill-state.js').SkillStateLabel | null;
  newState: import('./skill-state.js').SkillStateLabel | null;
  /** Short, deterministic, template-generated explanation — NOT an AI summary. See src/events/growth-event-engine.ts. */
  explanation: string;
  modelVersion: string;
}
