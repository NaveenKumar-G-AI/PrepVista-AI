/**
 * ACEAPT — Feature 2: Adaptive Aptitude Diagnostic Engine
 * ---------------------------------------------------------------------------
 * Core domain contract.
 *
 * This file is the single source of truth for every shape that crosses a
 * boundary in the system:
 *   - OnboardingContext   -> what Feature 1 is expected to hand to Feature 2
 *   - DiagnosticResult    -> what Feature 2 hands to Feature 3+ (the
 *                            "Evidence-Based Capability Profile")
 *   - everything in between (questions, skills, sessions, evidence)
 *
 * Feature 1 does not exist yet in this codebase, so OnboardingContext is a
 * contract, not an integration. `src/app/onboarding-sim` is a clearly-labeled
 * stand-in that produces a real value of this type so Feature 2 can be
 * exercised end to end. When the real Feature 1 exists, it only needs to
 * produce this same shape — nothing in Feature 2 needs to change.
 */

// -----------------------------------------------------------------------------
// Feature 1 -> Feature 2 contract
// -----------------------------------------------------------------------------

export type ConfidenceSelfRating = "LOW" | "MEDIUM" | "HIGH";

export type PainPoint =
  | "SPEED"
  | "CARELESS_MISTAKES"
  | "CONCEPTUAL_GAPS"
  | "UNFAMILIAR_VARIATIONS"
  | "TIME_PRESSURE"
  | "CONSISTENCY";

export interface OnboardingContext {
  id: string;
  studentId: string;
  version: number;
  createdAt: string;

  preparationGoal: string; // e.g. "Campus placement", "CAT", "Bank PO"
  targetDate: string | null; // ISO date, nullable — student may not have one
  timelineCategory: "URGENT" | "MODERATE" | "LONG_TERM" | "UNSPECIFIED";
  daysAvailable: number | null;
  experienceLevel: "FIRST_TIME" | "RETAKING" | "EXPERIENCED";
  previousPreparation: string | null;

  // Self-perception. Feature 2 MUST treat these as context, never as
  // measured fact — see evidenceEngine.ts and reportBuilder.ts.
  confidenceQuantitative: ConfidenceSelfRating;
  confidenceLogical: ConfidenceSelfRating;
  confidenceVerbal: ConfidenceSelfRating;
  confidenceTimePressure: ConfidenceSelfRating;

  primaryPainPoint: PainPoint;
  secondaryPainPoints: PainPoint[];
}

// -----------------------------------------------------------------------------
// Skill hierarchy
// -----------------------------------------------------------------------------

export type Domain = "QUANTITATIVE" | "LOGICAL" | "VERBAL";

export interface SkillNode {
  id: string;
  domain: Domain;
  topic: string;
  subtopic: string | null;
  concept: string | null;
  displayName: string;
  description: string;
  /** Immediate prerequisite skill, if any. Used for root-cause investigation. */
  prerequisiteSkillId: string | null;
}

// -----------------------------------------------------------------------------
// Questions
// -----------------------------------------------------------------------------

export type ApplicationType = "FOUNDATION" | "APPLICATION" | "TRANSFER";

export type ValidationStatus = "PENDING" | "VALIDATED" | "REJECTED";

export type SourceType = "HUMAN_AUTHORED" | "AI_GENERATED";

export interface Question {
  id: string;
  version: number;
  skillNodeId: string;
  applicationType: ApplicationType;
  difficulty: 1 | 2 | 3 | 4;
  questionType: "MCQ";
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  expectedReasoning: string | null;
  commonErrorTypes: string[];
  skillTags: string[];
  estimatedTimeSeconds: number;
  validationStatus: ValidationStatus;
  validationNotes: string | null;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

/** What is sent to the client — never includes the answer. */
export type PublicQuestion = Omit<
  Question,
  "correctAnswer" | "explanation" | "expectedReasoning" | "commonErrorTypes" | "validationNotes"
>;

// -----------------------------------------------------------------------------
// Diagnostic session
// -----------------------------------------------------------------------------

export type DiagnosticStatus =
  | "NOT_STARTED"
  | "INITIALIZING"
  | "IN_PROGRESS"
  | "PAUSED"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED_RETRYABLE"
  | "ABANDONED";

export interface DiagnosticSession {
  id: string;
  studentId: string;
  onboardingContextId: string;
  onboardingContextVersion: number;
  diagnosticVersion: number;
  status: DiagnosticStatus;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  stopReason: string | null;
}

/**
 * Why a given question was selected. Exposed internally for explainability
 * and analytics; deliberately NOT sent to the client (see spec: "Do not
 * expose internal implementation details unnecessarily to students").
 */
export type QuestionPurpose =
  | "BASELINE"
  | "COVERAGE"
  | "DIFFICULTY_ESCALATION"
  | "DIFFICULTY_REDUCTION"
  | "VERIFICATION"
  | "PREREQUISITE_CHECK";

export interface QuestionPresentation {
  id: string;
  sessionId: string;
  questionId: string;
  purpose: QuestionPurpose;
  rationale: string;
  sequenceIndex: number;
  captureConfidence: boolean;
  presentedAt: string;
}

export type ResponseStatus = "ANSWERED" | "SKIPPED" | "TIMED_OUT" | "DONT_KNOW";

export type ConfidenceLevel =
  | "GUESSING"
  | "NOT_SURE"
  | "SOMEWHAT_CONFIDENT"
  | "CONFIDENT"
  | "VERY_CONFIDENT";

export interface ResponseRecord {
  id: string;
  sessionId: string;
  presentationId: string;
  questionId: string;
  status: ResponseStatus;
  studentAnswer: string | null;
  isCorrect: boolean | null; // null unless status === 'ANSWERED'
  confidenceLevel: ConfidenceLevel | null;
  questionStartedAt: string;
  questionAnsweredAt: string;
  responseDurationMs: number;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Capability state (derived, in-memory — never stored mutably; see
// lib/domain/capabilityState.ts). This is the live "what do we know so far"
// snapshot the selection engine and report builder both read from.
// -----------------------------------------------------------------------------

export type EvidenceLevel =
  | "NOT_ASSESSED"
  | "LIMITED_EVIDENCE"
  | "EMERGING"
  | "DEVELOPING"
  | "FUNCTIONAL"
  | "STRONG"
  | "ADVANCED"
  | "VERIFIED";

export interface AttemptRecord {
  questionId: string;
  presentationId: string;
  applicationType: ApplicationType;
  difficulty: 1 | 2 | 3 | 4;
  purpose: QuestionPurpose;
  status: ResponseStatus;
  correct: boolean | null;
  responseDurationMs: number;
  estimatedTimeSeconds: number;
  confidence: ConfidenceLevel | null;
  sequenceIndex: number;
}

export interface SubEvidence {
  evidenceLevel: EvidenceLevel;
  attempts: number;
  correct: number;
  accuracy: number | null; // null if attempts === 0
  avgResponseTimeMs: number | null;
}

export interface SkillEvidenceState {
  skillId: string;
  overall: SubEvidence;
  foundation: SubEvidence;
  application: SubEvidence;
  transfer: SubEvidence;
  verified: boolean;
  attempts: AttemptRecord[];
  lastAttemptCorrect: boolean | null;
}

export interface PendingFollowUp {
  skillId: string;
  reason: "UNVERIFIED_INCORRECT" | "PREREQUISITE_UNCHECKED";
  relatedSkillId: string | null;
}

export interface CapabilityState {
  sessionId: string;
  skills: Record<string, SkillEvidenceState>;
  domainsCovered: Domain[];
  skillsCovered: string[];
  questionsAttempted: number;
  questionsAnswered: number;
  pendingFollowUps: PendingFollowUp[];
  askedQuestionIds: string[];
}

// -----------------------------------------------------------------------------
// Feature 2 -> Feature 3+ contract: the Evidence-Based Capability Profile
// -----------------------------------------------------------------------------

export interface DomainResult {
  domain: Domain;
  capabilityLevel: EvidenceLevel;
  accuracy: number | null;
  speedProfile: "FAST" | "MODERATE" | "SLOW" | "INSUFFICIENT_EVIDENCE";
  evidenceStrength: "LIMITED" | "MODERATE" | "STRONG";
  questionsAttempted: number;
}

export interface SkillResult {
  skillId: string;
  skillName: string;
  domain: Domain;
  overall: SubEvidence;
  foundation: SubEvidence;
  application: SubEvidence;
  transfer: SubEvidence;
}

export interface RootCauseFinding {
  skillId: string;
  skillName: string;
  relatedSkillId: string | null;
  relatedSkillName: string | null;
  narrative: string;
  confidence: "LOW" | "MODERATE";
}

export interface UnexpectedFinding {
  domain: Domain;
  kind: "UNDERRATED_STRENGTH" | "OVERRATED_CONFIDENCE";
  narrative: string;
}

export interface ConfidenceAlignmentFinding {
  skillId: string;
  skillName: string;
  pattern: "CORRECT_HIGH_CONFIDENCE" | "CORRECT_LOW_CONFIDENCE" | "INCORRECT_HIGH_CONFIDENCE" | "INCORRECT_LOW_CONFIDENCE";
  narrative: string;
}

export type AiGenerationStatus = "SUCCESS" | "FALLBACK" | "NOT_ATTEMPTED";

export interface AiNarrative {
  overallSummary: string;
  strengthsNarrative: string;
  focusAreasNarrative: string;
  rootCauseNarrative: string | null;
  surpriseNarrative: string | null;
  encouragement: string;
}

/**
 * The "Evidence-Based Capability Profile" — Feature 2's primary output.
 * Every future ACEAPT feature (Skill Intelligence, AI Tutor, Adaptive
 * Practice, Mastery Engine, ...) consumes this shape rather than raw
 * response logs.
 */
export interface DiagnosticResult {
  id: string;
  sessionId: string;
  studentId: string;
  diagnosticVersion: number;
  scoringVersion: number;
  algorithmVersion: number;

  overallCapability: EvidenceLevel;
  totalQuestions: number;

  domainResults: DomainResult[];
  skillResults: SkillResult[];

  /** Feature 1's self-perception, kept alongside (never merged into) measured evidence — spec section 4. */
  selfPerceptionByDomain: Record<Domain, ConfidenceSelfRating>;

  accuracyOverall: number | null;
  speedProfileOverall: "FAST" | "MODERATE" | "SLOW" | "INSUFFICIENT_EVIDENCE";

  strengths: string[]; // skill ids
  focusAreas: string[]; // skill ids
  possibleRootCauses: RootCauseFinding[];
  unexpectedFindings: UnexpectedFinding[];
  confidenceAlignment: ConfidenceAlignmentFinding[];

  recommendedStartingPointSkillId: string | null;
  recommendedStartingPointReason: string;

  aiNarrative: AiNarrative | null;
  aiGenerationStatus: AiGenerationStatus;

  completedAt: string;
}
