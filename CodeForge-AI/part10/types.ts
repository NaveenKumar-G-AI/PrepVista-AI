// Reference type definitions for the Engineering Simulator.
//
// The engine itself (src/engine/*.js, src/validation/*.js) is written in
// dependency-free JavaScript with JSDoc types, on purpose — see README.md
// for why. This file gives the same shapes in plain TypeScript for API
// routes, the frontend, or anywhere else in a TS codebase that wants
// compiler-checked types against this package.

export type Difficulty =
  | 'foundation'
  | 'intermediate'
  | 'advanced'
  | 'production_simulation'
  | 'engineering_challenge';

export type TestType = 'visible' | 'hidden';

export type AssistanceLevel =
  | 'no_assistance'
  | 'concept_help'
  | 'error_explanation'
  | 'directional_hint'
  | 'architecture_guidance'
  | 'strong_guidance';

export type SessionStatus =
  | 'in_progress'
  | 'submitted'
  | 'evaluated'
  | 'revision_requested'
  | 'completed'
  | 'abandoned';

export interface RubricCategory {
  key: string;
  label: string;
  /** 0-100. All categories in a Rubric must sum to 100 — validated at write time. */
  weight: number;
}

export interface Rubric {
  id: string;
  name: string;
  categories: RubricCategory[];
}

export interface AcceptanceCriterion {
  id: string;
  requirementRef: string;
  description: string;
  testType: TestType;
  expectedBehavior: string;
}

export interface ProjectRequirements {
  businessGoal: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  assumptions: string[];
  ambiguities: string[];
  constraints: string[];
  edgeCases: string[];
  acceptanceCriteriaSummary: string[];
}

export interface ProjectDefinition {
  id: string;
  title: string;
  role: string;
  projectType: string;
  difficulty: Difficulty;
  timeEstimateMinutes: number;
  skills: string[];
  requirements: ProjectRequirements;
  rubricId: string;
  /** Resolved rubric — joined at read time from project_rubrics in production. */
  rubric: Rubric;
  acceptanceCriteria: AcceptanceCriterion[];
  securityRequirements: string[];
  performanceRequirements: string[];
  documentationRequirements: string[];
  supportedLanguages: string[];
  starterRepositoryRef?: string;
  /** Defaults to 70 if omitted — see evaluationEngine.js. */
  passThreshold?: number;
}

export interface CategoryScoreBreakdown {
  key: string;
  label: string;
  /** The category's weight as authored on the rubric. */
  weight: number;
  /** Weight after renormalizing around whichever categories were actually scored. */
  effectiveWeight: number;
  rawScore: number;
  weightedScore: number;
}

export interface TestRunResult {
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  failures: Array<{ id: string; message: string }>;
}

export interface SecurityFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface EvaluationFeedbackItem {
  category: string;
  observation: string;
  impact?: string;
  recommendation?: string;
  /** A file path or test id the observation is grounded in — never invented (Phase 21). */
  evidenceRef?: string;
}

export interface EvaluationResult {
  totalScore: number;
  breakdown: CategoryScoreBreakdown[];
  passed: boolean;
  aiAvailable: boolean;
  /** False whenever any rubric category had no score — e.g. AI was unavailable for the qualitative ones. */
  fullyAssessed: boolean;
  missingCategories: string[];
  testResult: TestRunResult;
  security: { securityFindings: SecurityFinding[] };
  feedback: EvaluationFeedbackItem[];
  evaluatedAt: string;
}

export interface EvidenceRecord {
  sessionId: string;
  studentId: string;
  skillTag: string;
  evidenceType: 'project_rubric_category' | 'project_completion';
  /** Null for presence-only evidence — let the mastery engine weigh it, don't fabricate a number. */
  strengthSignal: number | null;
  source: 'project';
  sourceRef: string;
  createdAt: string;
}

export interface ProjectSession {
  id: string;
  projectId: string;
  studentId: string;
  status: SessionStatus;
  assistanceLevel: AssistanceLevel;
  startedAt: string;
  completedAt?: string;
}

export interface RevisionRecord {
  sessionId: string;
  fromSubmissionId: string;
  toSubmissionId: string;
  addressedFeedbackIds: string[];
  createdAt: string;
}

export interface ImprovementDelta {
  totalScoreDelta: number;
  categoryDeltas: Array<{ key: string; before: number | null; after: number | null; delta: number | null }>;
}

export interface DecisionRecord {
  sessionId: string;
  decision: string;
  reason: string;
  alternative?: string;
  whyRejected?: string;
}
