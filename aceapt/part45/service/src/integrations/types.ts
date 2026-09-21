// ---------------------------------------------------------------------------
// Integration seams.
//
// Feature 45 must NOT duplicate the Mastery Engine, Mistake Engine,
// Retention Engine, or Goal system (spec sections 7, 39, 40, 68). Since this
// build has no existing ACEAPT codebase to inspect (see README), every one
// of those systems is represented here as a narrow interface plus a stub
// implementation in ./stubs — swap the stub for a real adapter and nothing
// above this layer (services, API, UI) needs to change.
// ---------------------------------------------------------------------------

import type { EvidenceConfidence } from '../domain/enums';

export interface MasteryReading {
  capability: number; // 0-100
  masterySourceRef: string;
}

/** Section 39: consume the real Mastery Engine's output, never recompute it. */
export interface MasteryEngineAdapter {
  getMastery(studentId: string, skillId: string): Promise<MasteryReading | null>;
}

export interface MistakeSignal {
  skillId: string;
  weight: number;
  occurredAt: Date;
  sourceRef: string;
}

/** Section 28: mistake intelligence feeds the graph as evidence, it is not reclassified here. */
export interface MistakeEngineAdapter {
  getMistakeSignals(studentId: string, skillId: string): Promise<MistakeSignal[]>;
}

export interface RetentionReading {
  isDeclining: boolean;
  retentionSourceRef: string;
}

/** Section 40: consume retention state (e.g. post-mastery decay), never reimplement spaced repetition here. */
export interface RetentionEngineAdapter {
  getRetentionSignal(studentId: string, skillId: string): Promise<RetentionReading | null>;
}

export interface GoalContext {
  goalId: string;
  label: string;
  skillCodes: string[]; // goal-relevant skill codes (Feature 44's domain, section 33)
  deadline: Date | null;
}

/** Section 41: Feature 44 owns goals; Feature 45 only reads which skills are goal-relevant. */
export interface GoalEngineAdapter {
  getActiveGoal(studentId: string): Promise<GoalContext | null>;
}

/** Resolves which students belong to an institution/cohort — Feature 45 does not own rosters (section 47). */
export interface RosterAdapter {
  getStudentIdsForInstitution(institutionId: string): Promise<string[]>;
}

export interface AIRelationshipSuggestion {
  suggestedType: string;
  rationale: string;
  confidence: EvidenceConfidence;
}

/**
 * Section 19: AI may only ever SUGGEST — output is always tagged
 * source=AI_SUGGESTED, status=DRAFT, and requires an admin approval step
 * before it can be published. Section 69: everything else in this service
 * keeps working with isAvailable()===false.
 */
export interface AISuggestionAdapter {
  isAvailable(): boolean;
  suggestRelationship(input: { fromSkillName: string; toSkillName: string; domainContext: string }): Promise<AIRelationshipSuggestion | null>;
}
