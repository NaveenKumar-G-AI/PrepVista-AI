import type { MasteryState } from './config.js';

export type EvidenceSource =
  | 'PRACTICE'
  | 'ASSESSMENT'
  | 'TIMED_ASSESSMENT'
  | 'TECHNICAL_INTERVIEW'
  | 'RETENTION_TEST'
  | 'DEBUGGING';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type FailureReason =
  | 'EDGE_CASE'
  | 'WRONG_COMPLEXITY'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'WRONG_APPROACH'
  | 'NO_SUBMISSION'
  | 'UNKNOWN';

export interface SkillEvidence {
  id: string;
  studentId: string;
  skillId: string;
  problemId: string | null;
  source: EvidenceSource;
  difficulty: Difficulty;
  independent: boolean;
  hintsUsed: number;
  solutionViewed: boolean;
  isTransfer: boolean;
  timed: boolean;
  passed: boolean;
  failureReason?: FailureReason;
  createdAt: string; // ISO timestamp
  /** PHASE 47 evidence immutability: a correction never rewrites a row, it adds
   *  a new one and flags the old one superseded. */
  supersededByCorrection?: boolean;
}

export interface MasteryResult {
  state: MasteryState;
  confidence: number; // 0..1
  rawScore: number;
  evidenceCount: number;
  independentPassCount: number;
  transferPassCount: number;
  highStakesPassCount: number;
  lastQualifyingEvidenceAt: string | null;
  isStale: boolean;
  /** Deterministic, evidence-grounded facts used to reach this state — never an AI guess. */
  reasons: string[];
}

export interface SkillNode {
  id: string;
  key: string;
  name: string;
  parentId: string | null;
  category: string;
}

export type SkillRelationshipType =
  | 'PREREQUISITE'
  | 'DEPENDS_ON'
  | 'RELATED_TO'
  | 'SUBSKILL_OF'
  | 'TRANSFERABLE_TO'
  | 'REQUIRED_FOR_ROLE';

export interface SkillRelationship {
  fromSkillId: string;
  toSkillId: string;
  type: SkillRelationshipType;
  weight: number; // 0..1, strength of the relationship
}

export type GapCategory =
  | 'PREREQUISITE_GAP'
  | 'CONCEPT_GAP'
  | 'PROBLEM_INTERPRETATION_GAP'
  | 'PATTERN_RECOGNITION_GAP'
  | 'ALGORITHM_SELECTION_GAP'
  | 'DATA_STRUCTURE_SELECTION_GAP'
  | 'IMPLEMENTATION_GAP'
  | 'EDGE_CASE_GAP'
  | 'DEBUGGING_GAP'
  | 'COMPLEXITY_GAP'
  | 'LANGUAGE_GAP'
  | 'TESTING_GAP'
  | 'TRANSFER_GAP'
  | 'RETENTION_GAP'
  // Used when the execution/test engine hasn't supplied enough structured
  // signal (failureReason) to classify further. See docs/CODEFORGE_EVIDENCE_MODEL.md.
  | 'NEEDS_REVIEW';

export interface PrerequisiteState {
  skillId: string;
  state: MasteryState;
}

export interface GapDiagnosis {
  skillId: string;
  category: GapCategory;
  /** The skill to actually work on next — may be a prerequisite, not the failing skill itself. */
  targetSkillId: string;
  reasons: string[];
}

export type NextActionType =
  | 'LEARN_CONCEPT'
  | 'GUIDED_PRACTICE'
  | 'INDEPENDENT_PRACTICE'
  | 'TRANSFER_PRACTICE'
  | 'DEBUGGING_PRACTICE'
  | 'TIMED_CHALLENGE'
  | 'RETENTION_CHECK'
  | 'VERIFICATION'
  | 'TECHNICAL_INTERVIEW'
  | 'REVIEW_PREREQUISITE'
  | 'LANGUAGE_PRACTICE';

export interface Recommendation {
  skillId: string;
  actionType: NextActionType;
  priorityScore: number;
  isPrimary: boolean;
  reasons: string[];
  expectedOutcome: string;
}
