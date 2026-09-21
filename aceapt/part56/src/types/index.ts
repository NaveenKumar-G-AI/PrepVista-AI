/**
 * ACEAPT - Feature 56: Formula Intelligence Engine
 * Core domain types.
 *
 * These mirror the entities described in the Feature 56 spec (sections 11,
 * 32-33, 35, 57, 160-163) while staying storage-agnostic. The same types are
 * used whether the data ultimately lives in Postgres (see
 * prisma/schema.prisma), in the in-memory store (see src/repositories), or
 * something already in your ACEAPT codebase that these get mapped onto.
 */

// ---------------------------------------------------------------------------
// Formula knowledge (spec sections 11-22)
// ---------------------------------------------------------------------------

export type FormulaStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'SUSPENDED'
  | 'DEPRECATED'
  | 'RETIRED';

export type RelationshipType =
  | 'RELATED_TO'
  | 'DERIVED_FROM'
  | 'INVERSE_OF'
  | 'SPECIAL_CASE_OF'
  | 'OFTEN_CONFUSED_WITH'
  | 'REQUIRES'
  | 'USED_WITH';

export interface FormulaVariable {
  symbol: string;
  meaning: string;
  unit?: string;
  role?: string;
}

export interface FormulaConditions {
  whenToUse: string;
  whenNotToUse?: string;
}

export interface DerivedForm {
  targetVariable: string;
  expression: string;
  /** Populated by the validation service (src/validation) - never hand-set. */
  validated?: boolean;
}

export interface Formula {
  formulaId: string;
  canonicalName: string;
  canonicalExpression: string;
  domain: string;
  concept: string;
  meaning: string;
  variables: FormulaVariable[];
  conditions: FormulaConditions;
  derivedForms: DerivedForm[];
  skillId?: string;
  subSkillId?: string;
  status: FormulaStatus;
  version: number;
  source: string;
  /** Undefined = global/shared canonical content, not tenant-private. */
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormulaRelationship {
  id: string;
  sourceFormulaId: string;
  targetFormulaId: string;
  relationshipType: RelationshipType;
  evidenceBacked: boolean;
}

// ---------------------------------------------------------------------------
// Competency / student state (spec sections 32-33, 160)
// ---------------------------------------------------------------------------

export const COMPETENCY_DIMENSIONS = [
  'recognition',
  'recall',
  'selection',
  'mapping',
  'application',
  'verification',
  'transfer',
  'retention',
] as const;

export type CompetencyDimension = (typeof COMPETENCY_DIMENSIONS)[number];

export interface DimensionEvidence {
  attempts: number;
  correct: number;
  /** Rolling window, oldest first, most recent last. */
  recentOutcomes: boolean[];
  lastAttemptAt?: Date;
}

export type DimensionStatusLabel = 'UNKNOWN' | 'NEEDS_ATTENTION' | 'DEVELOPING' | 'STRONG';

export const SUPPORT_LEVELS = ['FORMULA_SHOWN', 'FAMILY_SHOWN', 'CANDIDATES_SHOWN', 'INDEPENDENT'] as const;

export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

export interface FormulaStudentState {
  studentId: string;
  formulaId: string;
  dimensions: Record<CompetencyDimension, DimensionEvidence>;
  supportLevel: SupportLevel;
  independentStreak: number;
  regressionFlag: boolean;
  lastEvidenceAt?: Date;
}

// ---------------------------------------------------------------------------
// Errors (spec section 35)
//
// Note: the spec lists FORMULA_SUBSTITUTION_ERROR separately from
// FORMULA_APPLICATION_ERROR. This scaffold folds substitution into
// application, since both surface identically from the engine's point of
// view ("right formula, right mapping, wrong resulting computation") unless
// your content pipeline can reliably tell "plugged the right number into
// the wrong slot of the expression" apart from "computed wrong" - split
// them further if it can.
// ---------------------------------------------------------------------------

export type FormulaErrorType =
  | 'FORMULA_RECALL_ERROR'
  | 'FORMULA_SELECTION_ERROR'
  | 'VARIABLE_MAPPING_ERROR'
  | 'FORMULA_CONDITION_ERROR'
  | 'FORMULA_REARRANGEMENT_ERROR'
  | 'FORMULA_APPLICATION_ERROR'
  | 'FORMULA_VERIFICATION_ERROR'
  | 'FORMULA_TRANSFER_ERROR'
  | 'FORMULA_RETENTION_ERROR';

// ---------------------------------------------------------------------------
// Training (spec sections 57, 161-162)
// ---------------------------------------------------------------------------

export type TrainingActivityType =
  | 'RECOGNIZE'
  | 'RECALL'
  | 'SELECT'
  | 'MAP'
  | 'APPLY'
  | 'VERIFY'
  | 'TRANSFER'
  | 'RETAIN';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type Novelty = 'FAMILIAR' | 'NOVEL';

export interface FormulaTrainingSession {
  sessionId: string;
  studentId: string;
  formulaId: string;
  tenantId?: string;
  assessmentMode: boolean;
  startedAt: Date;
}

export interface FormulaTrainingAttempt {
  id: string;
  sessionId: string;
  studentId: string;
  formulaId: string;
  formulaVersionAtAttempt: number;
  activityType: TrainingActivityType;
  correct: boolean;
  errorType: FormulaErrorType | null;
  distractorFormulaId?: string;
  involvedConfusionPair?: boolean;
  responseTimeMs?: number;
  hintLevel?: number;
  difficulty?: Difficulty;
  novelty?: Novelty;
  createdAt: Date;
}

/**
 * What the calling layer submits when a student finishes an activity.
 *
 * By design, the "ground truth" fields (correctFormulaId, expectedMapping,
 * expectedAnswer, ...) are supplied by the CALLER, not looked up internally
 * - this engine does not own question content. Your Question Bank /
 * validated content pipeline (Feature 53/54 in the source spec) is the
 * source of truth for what a given question actually requires; this engine
 * only compares the student's submission to that ground truth and turns the
 * comparison into formula-specific evidence. See docs/INTEGRATION.md.
 *
 * `presentedFormulaId` identifies the formula this activity is scoped to.
 * For RECALL/SELECT activities, if `correctFormulaId` is also given and
 * differs from `presentedFormulaId` (e.g. a discrimination question started
 * from a "Simple Interest" session where Compound Interest is actually the
 * right answer for this specific item), the resulting evidence is
 * attributed to `correctFormulaId` - see
 * FormulaTrainingEngine.resolveAttributedFormulaId.
 */
export interface AttemptInput {
  sessionId: string;
  activityType: TrainingActivityType;
  presentedFormulaId: string;
  difficulty?: Difficulty;
  novelty?: Novelty;
  responseTimeMs?: number;
  hintLevel?: number;

  // RECALL / SELECT
  correctFormulaId?: string;
  chosenFormulaId?: string;
  /** True when the candidate set was built from a discriminationCandidateFormulaIds directive. */
  wasDiscriminationDrill?: boolean;

  // MAP / APPLY
  expectedMapping?: Record<string, number>;
  submittedMapping?: Record<string, number>;

  // APPLY
  expectedTargetVariable?: string;
  expectedAnswer?: number;
  submittedAnswer?: number;
  answerTolerance?: number;
  usedRearrangedForm?: string;
  expectedRearrangedForm?: string;

  // VERIFY
  verificationExpected?: boolean;
  verificationSubmitted?: boolean;

  // TRANSFER / RETAIN reuse the RECALL/SELECT/APPLY fields above - they are
  // distinguished by `novelty` / timing, not by shape.
}

export interface AttemptFeedback {
  correct: boolean;
  errorType: FormulaErrorType | null;
  message: string;
  supportLevel: SupportLevel;
}

// ---------------------------------------------------------------------------
// Auth (minimal - see src/api/middleware.ts for caveats)
// ---------------------------------------------------------------------------

export type Role = 'STUDENT' | 'TRAINER' | 'CONTENT_EDITOR' | 'REVIEWER' | 'ADMIN' | 'SYSTEM';

export interface AuthContext {
  userId: string;
  role: Role;
  tenantId?: string;
}
