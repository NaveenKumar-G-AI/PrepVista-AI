// ACEAPT Feature 42 — core domain types.
// These are the engine's own vocabulary. They are deliberately NOT copies of
// any assumed existing-ACEAPT type — see TRUTH_TABLE.md for why, and
// src/types/contracts.ts for the ports where real ACEAPT types would plug in.

export type BlueprintNodeLevel = "domain" | "topic" | "subtopic" | "skill";

export interface BlueprintNode {
  id: string;
  blueprintId: string;
  parentNodeId: string | null;
  level: BlueprintNodeLevel;
  code: string;
  label: string;
  minEvidenceCount: number;
  targetDifficultyWeight: Record<QuestionDifficulty, number>;
}

export interface Blueprint {
  id: string;
  name: string;
  mode: DiagnosticMode;
  nodes: BlueprintNode[];
}

export type QuestionDifficulty = "easy" | "medium" | "hard" | "very_hard";

export type DiagnosticMode =
  | "first_diagnostic"
  | "placement_diagnostic"
  | "topic_diagnostic"
  | "subtopic_diagnostic"
  | "company_diagnostic"
  | "reassessment"
  | "verification_diagnostic";

/** Module 3 — question metadata. Reuse the real ACEAPT question model's
 * equivalent fields; this shape is the minimum the engine needs. */
export interface DiagnosticQuestion {
  id: string;
  domain: string;
  topic: string;
  subtopic: string | null;
  skillNodeId: string;
  difficulty: QuestionDifficulty;
  expectedTimeMs: number;
  questionType: string;
  concept?: string;
  qualityStatus: "active" | "flagged" | "retired";
}

export type SessionStatus = "in_progress" | "paused" | "completed" | "abandoned" | "expired";

export interface DiagnosticSession {
  id: string;
  tenantId: string;
  studentId: string;
  blueprintId: string;
  mode: DiagnosticMode;
  status: SessionStatus;
  workingState: SessionWorkingState;
  baselineSessionId: string | null;
  startedAt: string;
  lastActivityAt: string;
  responseCount: number;
}

/** Purely a resume cache — never authoritative for scoring. */
export interface SessionWorkingState {
  askedQuestionIds?: string[];
  questionCursor?: number;
  fatigueSignals?: FatigueSignals;
  [key: string]: unknown;
}

export interface FatigueSignals {
  consecutiveFastGuessLikeAnswers: number;
  responseTimeTrend: "flat" | "increasing" | "decreasing";
  recentAccuracyDrop: boolean;
}

/** Module 6 — one submitted response, as captured from the client. Nothing
 * here is ever fabricated; a field the client didn't send is left undefined. */
export interface RawResponseInput {
  clientResponseId: string;
  questionId: string;
  skillNodeId: string;
  answer: unknown;
  isCorrect: boolean | null; // null represents a skip
  questionDifficulty: QuestionDifficulty;
  expectedDurationMs: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  confidence?: 1 | 2 | 3 | 4 | 5;
  hintUsed: boolean;
  attemptNumber: number;
  wasPreviouslyExposed: boolean;
}

export type TimingClassification =
  | "fast_correct"
  | "fast_wrong"
  | "slow_correct"
  | "slow_wrong"
  | "expected_correct"
  | "expected_wrong"
  | "skipped";

export type QualityFlag =
  | "hint_assisted"
  | "repeated_exposure"
  | "abnormal_timing_too_fast"
  | "abnormal_timing_too_slow"
  | "low_confidence_correct"
  | "high_confidence_wrong"
  | "skipped_question";

/** Module 10 — derived from a RawResponseInput, never persisted without it. */
export interface DiagnosticEvidence {
  responseId?: string; // set once persisted
  skillNodeId: string;
  isCorrect: boolean | null;
  evidenceWeight: number; // 0..1
  timingClassification: TimingClassification;
  qualityFlags: QualityFlag[];
  confidence?: 1 | 2 | 3 | 4 | 5;
}

export type CapabilityStatus = "strong" | "solid" | "developing" | "needs_focus" | "insufficient_evidence";
export type DiagnosticConfidenceState = "high" | "moderate" | "low" | "conflicted" | "incomplete";

/** Module 13/58 — one node's capability estimate, always traceable. */
export interface SkillEstimate {
  skillNodeId: string;
  nodeLevel: BlueprintNodeLevel;
  nodeCode: string;
  nodeLabel: string;
  parentNodeId: string | null;
  pointEstimate: number; // 0..1
  status: CapabilityStatus;
  confidenceState: DiagnosticConfidenceState;
  evidenceCount: number;
  weightedEvidence: number;
  consistencyFlag: boolean;
}

export interface EvidenceTrace {
  conclusion: string;
  supportingEvidence: string[];
  confidence: DiagnosticConfidenceState;
}

export interface RecommendedAction {
  skillNodeId: string;
  priority: "high" | "medium" | "low";
  recommendedAction: string;
  evidenceConfidence: DiagnosticConfidenceState;
  rationale: string;
}

export interface DifficultyBoundary {
  domainOrTopicNodeId: string;
  accuracyByDifficulty: Partial<Record<QuestionDifficulty, number>>;
  boundaryDetected: boolean;
  interpretation: string;
}

export interface SpeedProfileEntry {
  scopeNodeId: string;
  averageDurationMs: number;
  averageExpectedRatio: number; // duration / expected, averaged
  label: "fast" | "on_pace" | "slow" | "insufficient_evidence";
}

export interface AccuracyProfileEntry {
  scopeNodeId: string;
  accuracy: number;
  speedConditionedAccuracy?: { fastAccuracy: number; slowAccuracy: number };
}

export interface ConsistencyResult {
  skillNodeId: string;
  isConsistent: boolean;
  chunkAccuracies: number[];
  note?: string;
}

export type CalibrationPattern = "overconfident" | "underconfident" | "well_calibrated" | "insufficient_evidence";

export interface ConfidenceCalibrationEntry {
  scopeNodeId: string;
  pattern: CalibrationPattern;
  highConfidenceWrongRate: number | null;
  lowConfidenceCorrectRate: number | null;
}

export interface BottleneckSignal {
  skillNodeId: string;
  possibleBottleneckOf: string[]; // skill node ids this may be blocking
  note: string;
}

/** Module 21 — the full assembled profile the result experience renders. */
export interface StudentDiagnosticProfile {
  sessionId: string;
  studentId: string;
  overallStatus: CapabilityStatus | "incomplete";
  overallConfidence: DiagnosticConfidenceState;
  domainProfiles: SkillEstimate[];
  topicProfiles: SkillEstimate[];
  subtopicProfiles: SkillEstimate[];
  skillProfiles: SkillEstimate[];
  strengths: SkillEstimate[];
  weaknesses: SkillEstimate[];
  speedProfile: SpeedProfileEntry[];
  accuracyProfile: AccuracyProfileEntry[];
  difficultyBoundaries: DifficultyBoundary[];
  consistency: ConsistencyResult[];
  confidenceCalibration: ConfidenceCalibrationEntry[];
  bottlenecks: BottleneckSignal[];
  evidenceTraces: EvidenceTrace[];
  recommendedNextStep: RecommendedAction[];
  generatedAt: string;
}

export type StoppingDecision =
  | { shouldStop: false; reason: "coverage_incomplete" | "confidence_insufficient" }
  | { shouldStop: true; reason: "coverage_and_confidence_met" | "max_questions_reached" | "fatigue_detected" };
