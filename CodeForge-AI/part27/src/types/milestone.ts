/**
 * Milestones — section 29-30. Meaningful, evidence-backed achievements.
 * A milestone is only ever created by src/milestones/milestone-engine.ts
 * evaluating a MilestoneDefinition's eligibility rule against real evidence
 * and growth events — never by a counter crossing an arbitrary number.
 */

export type MilestoneId =
  | 'FIRST_TRANSFER_OF_WEAK_CONCEPT'
  | 'SUSTAINED_DEBUGGING_IMPROVEMENT'
  | 'ROLE_READINESS_THRESHOLD'
  | 'STABLE_MASTERY_MULTI_CONTEXT'
  | 'FIRST_RECOVERY';

export interface GrowthMilestone {
  milestoneId: string; // instance id (uuid), not the MilestoneId definition key
  definitionId: MilestoneId;
  studentId: string;
  skillId: string | null;
  title: string;
  description: string;
  timestamp: string;
  evidenceRefs: string[];
  confidence: import('./skill-state.js').ConfidenceLevel;
  definitionVersion: string;
}

export interface MilestoneEligibilityContext {
  studentId: string;
  skillStates: import('./skill-state.js').SkillState[];
  events: import('./growth-event.js').GrowthEvent[];
  /**
   * Optional adapters into CodeForge's real skill taxonomy (section 10 —
   * this module consumes the taxonomy, it never redefines it). When
   * omitted, taxonomy-aware milestones simply have nothing to key off of
   * and stay dormant rather than guessing.
   */
  debuggingSkillIds?: Set<string>;
  roleId?: string;
}

export interface MilestoneDefinition {
  id: MilestoneId;
  version: string;
  minConfidenceScore: number;
  title: string;
  describe: (ctx: MilestoneEligibilityContext, skillId: string | null) => string;
  /** Returns evidence refs proving eligibility, or null if not eligible. Pure function — no side effects. */
  isEligible: (ctx: MilestoneEligibilityContext) => { skillId: string | null; evidenceRefs: string[]; confidence: import('./skill-state.js').ConfidenceLevel } | null;
}
