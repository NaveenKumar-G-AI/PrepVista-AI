// =============================================================================
// Shared domain types for the CodeForge Adaptive Engine.
// =============================================================================

export type Language = 'javascript' | 'python';

export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD' | 'ADVANCED';

export type ContextType = 'STANDARD' | 'NOVEL' | 'BRIDGE';

export type HarnessType = 'function' | 'stateful_ops';

export type MasteryState =
  | 'UNKNOWN' | 'INTRODUCED' | 'EXPLORING' | 'DEVELOPING'
  | 'COMPETENT' | 'STRONG' | 'ADVANCED' | 'MASTERED';

export type Trend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INCONSISTENT' | 'INSUFFICIENT_DATA';

export type GapType =
  | 'KNOWLEDGE_GAP' | 'APPLICATION_GAP' | 'DEBUGGING_GAP' | 'COMPLEXITY_GAP'
  | 'TRANSFER_GAP' | 'PREREQUISITE_GAP' | 'RETENTION_GAP' | 'INSUFFICIENT_EVIDENCE';

export type InterventionType =
  | 'DIRECT_PRACTICE' | 'PREREQUISITE_REVIEW' | 'BRIDGE_CHALLENGE' | 'DEBUGGING_CHALLENGE'
  | 'CONCEPT_APPLICATION' | 'TRANSFER_CHALLENGE' | 'COMPLEXITY_CHALLENGE' | 'MASTERY_VERIFICATION'
  | 'SPACED_REVIEW' | 'EXPLORATION' | 'ROLE_SPECIFIC_PRACTICE' | 'INTERVIEW_STYLE_CHALLENGE';

export type MistakeCategory =
  | 'NONE' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'LOGIC_ERROR'
  | 'BOUNDARY_CONDITION' | 'COMPLEXITY_ISSUE' | 'STATE_MANAGEMENT_ERROR' | 'INCOMPLETE';

export type AssistanceLevel = 'NONE' | 'HINT' | 'SOLUTION_VIEWED';

export type RelationshipType = 'PREREQUISITE' | 'RELATED_TO' | 'BUILDS_ON' | 'TRANSFER_TO';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type PracticeMode = 'RECOMMENDED' | 'CHOOSE_SKILL' | 'WEAK_AREA' | 'RANDOM_PRACTICE' | 'INTERVIEW_MODE';

export interface Skill {
  id: string;
  name: string;
  parentSkillId: string | null;
  description: string | null;
}

export interface SkillRelationship {
  id: string;
  fromSkillId: string;
  toSkillId: string;
  relationshipType: RelationshipType;
  weight: number;
}

export interface Student {
  id: string;
  email: string;
  displayName: string;
  targetRole: string | null;
  goal: string;
  prepDeadline: string | null;
  dailyTargetMinutes: number | null;
}

export interface TestCase {
  id: string;
  challengeId: string;
  language: Language;
  input: unknown;
  expected: unknown;
  isHidden: boolean;
  category: string;
  orderIndex: number;
}

export interface Challenge {
  id: string;
  title: string;
  primarySkillId: string;
  secondarySkillIds: string[];
  difficultyLevel: DifficultyLevel;
  difficultyScore: number;
  conceptDifficulty: number;
  implementationComplexity: number;
  constraintComplexity: number;
  reasoningComplexity: number;
  ambiguity: number;
  contextType: ContextType;
  harnessType: HarnessType;
  languagesSupported: Language[];
  status: 'ACTIVE' | 'ARCHIVED' | 'BROKEN';
  isVerification: boolean;
  prompt: string;
  functionName: string;
  transferOfChallengeId: string | null;
}

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  actual?: unknown;
  error?: string | null;
  timedOut: boolean;
  category: string;
  runtimeMs: number;
}

export interface EvaluationResult {
  attemptId: string;
  testsTotal: number;
  testsPassed: number;
  passed: boolean;
  runtimeError: boolean;
  syntaxError: boolean;
  timeout: boolean;
  results: TestCaseResult[];
}

export interface Diagnosis {
  attemptId: string;
  mistakeCategory: MistakeCategory;
  languageIssue: boolean;
  failurePattern: string | null;
  details: string;
}

export interface Attempt {
  id: string;
  studentId: string;
  challengeId: string;
  language: Language;
  code: string;
  clientAttemptId: string | null;
  assistanceUsed: AssistanceLevel;
  recommendationId: string | null;
  submittedAt: string;
}

export interface Evidence {
  id: string;
  studentId: string;
  skillId: string;
  attemptId: string;
  challengeId: string;
  isPrimary: boolean;
  rawScore: number;
  difficultyScore: number;
  independent: boolean;
  assistanceUsed: AssistanceLevel;
  mistakeCategory: MistakeCategory | null;
  languageIssue: boolean;
  contextType: ContextType;
  createdAt: string;
}

export interface StudentSkillState {
  studentId: string;
  skillId: string;
  masteryScore: number;
  confidenceScore: number;
  masteryState: MasteryState;
  trend: Trend;
  evidenceCount: number;
  independentSuccessCount: number;
  distinctChallengesCount: number;
  contradictionFlag: boolean;
  masteryVerified: boolean;
  lastAssessedAt: string | null;
  nextReviewAt: string | null;
}

export interface GapAssessment {
  skillId: string;
  gapType: GapType;
  severity: number; // 0-1, higher = more urgent
  explanation: string;
  rootCauseSkillId?: string; // populated when a prerequisite is the true root cause
}

export interface Recommendation {
  id: string;
  studentId: string;
  challengeId: string;
  skillId: string;
  gapType: GapType | null;
  interventionType: InterventionType;
  learningObjective: string;
  reason: string;
  rankingScore: number;
  isRepetition: boolean;
  isExploration: boolean;
  evidenceSnapshot: Record<string, unknown>;
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
}
