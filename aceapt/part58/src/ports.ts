/**
 * Feature 58 — Guessing Intelligence Engine
 * PORTS
 *
 * Every interface below stands in for an existing ACEAPT capability that this
 * spec says to reuse, not duplicate (§13-15, §64-74, §183-186). Since this
 * module was built without access to that real codebase, each upstream
 * dependency is expressed as a small port (interface). `adapters/defaultPorts.ts`
 * ships a safe, inert implementation of every one of these so the module runs
 * standalone; swap in real adapters that call your existing services and
 * nothing else in this module needs to change.
 *
 * This is the main integration surface — start here when wiring Feature 58
 * into the rest of ACEAPT.
 */

import type {
  ConfidenceBand,
  DecisionAction,
  DecisionContext,
  DecisionPolicy,
  EvidenceLevel,
  EvidenceType,
  NewDecisionPolicy,
  TrainingScenario,
} from './types';

export interface ComparableFilter {
  difficultyLevel?: number;
  questionType?: string;
}

/** Feature 34 — Confidence Intelligence. Feature 58 reads confidence, never computes it. */
export interface ConfidenceProvider {
  getConfidence(
    studentId: string,
    questionVersionId: string
  ): Promise<{ band: ConfidenceBand; probability?: number } | null>;
}

/** Feature 49 — Anti-Memorization / novelty context. */
export interface NoveltyProvider {
  getNovelty(studentId: string, questionVersionId: string): Promise<{ isNovel: boolean } | null>;
}

/** Feature 50 — Speed. Personal pace, used for time-aware decisions. */
export interface SpeedProvider {
  getExpectedStudentTimeSeconds(studentId: string, questionVersionId: string): Promise<number | null>;
}

/** Feature 51 — Accuracy. Historical reliability, used e.g. to judge whether a skip was strategic. */
export interface AccuracyProvider {
  getComparableAccuracy(
    studentId: string,
    filter: ComparableFilter
  ): Promise<{ accuracy: number; sampleSize: number } | null>;
}

/** Feature 52 — Timed Challenge. Pressure context. */
export interface PressureContextProvider {
  getPressureContext(studentId: string, assessmentId: string): Promise<{ underPressure: boolean } | null>;
}

/** Feature 53 — Question Quality. Invalid/low-quality items must not become decision evidence (§65-66). */
export interface QuestionQualityProvider {
  isHighQuality(questionVersionId: string): Promise<boolean>;
}

/** Feature 54 — Question Validity. */
export interface QuestionValidityProvider {
  isValid(questionVersionId: string): Promise<boolean>;
}

/** Feature 55 — Difficulty Calibration. */
export interface DifficultyProvider {
  getCalibratedDifficulty(
    questionVersionId: string
  ): Promise<{ level: number; expectedTimeSeconds: number } | null>;
}

export interface EliminationCondition {
  optionId: string;
  reason: EvidenceType;
}

/** Feature 56 — Formula Intelligence. */
export interface FormulaIntelligenceProvider {
  getFormulaContext(
    questionVersionId: string
  ): Promise<{ formulaKnown: boolean; eliminationConditions?: EliminationCondition[] } | null>;
}

/** Feature 57 — Shortcut Library / solving strategy. */
export interface ShortcutStrategyProvider {
  getApplicableStrategies(questionVersionId: string): Promise<string[]>;
}

/** Mistake Intelligence — conceptual/technical cause of errors (distinct from decision behavior, §74). */
export interface MistakeIntelligenceProvider {
  getRecentMistakePatterns(studentId: string): Promise<string[]>;
}

/** The actual, authoritative assessment scoring engine. Feature 58 must read
 *  this, never invent scoring rules (§30-31, §120-121). Return null when the
 *  policy for an assessment version genuinely isn't known yet. */
export interface ScoringPolicyProvider {
  getScoringPolicy(assessmentVersionId: string): Promise<NewDecisionPolicy | null>;
}

/** Verifies a claimed option elimination against real question metadata
 *  (unit/magnitude/sign/logical/formula conditions) where the system can. If
 *  no verifier is wired in, elimination is recorded as SELF_REPORTED (§102-103). */
export interface QuestionEliminationVerifier {
  verifyElimination(questionVersionId: string, optionId: string, claimedType: EvidenceType): Promise<EvidenceLevel>;
}

export type AnalyticsEventName =
  | 'decision_started'
  | 'confidence_recorded'
  | 'option_eliminated'
  | 'partial_progress_recorded'
  | 'action_selected'
  | 'guess_made'
  | 'informed_guess_recorded'
  | 'blind_guess_recorded'
  | 'skip_selected'
  | 'return_later'
  | 'answer_changed'
  | 'answer_kept'
  | 'decision_completed'
  | 'decision_reviewed'
  | 'confidence_calibration_updated'
  | 'decision_insight_generated';

/** Reuse the existing analytics pipeline — do not build a parallel one (§149). */
export interface AnalyticsPublisher {
  publish(event: AnalyticsEventName, payload: Record<string, unknown>): Promise<void>;
}

export interface ExplainDecisionInput {
  action: DecisionAction;
  context: DecisionContext;
  isCorrect: boolean | null;
  evidenceSummary: string;
}

export interface SummarizeInput {
  bottleneck: string;
  stats: Record<string, unknown>;
}

export interface ScenarioSpec {
  mode: TrainingScenario['mode'];
  difficultyLevel: number;
  policy?: DecisionPolicy | null;
}

/** AI may explain, summarize, and draft scenarios — never decide scoring or
 *  leak recommendations into a live assessment (§191, §194). Everything here
 *  must keep working with AI_GATEWAY_API_KEY unset — see the template fallback
 *  in adapters/defaultPorts.ts (§192, "AI FALLBACK"). */
export interface AIGateway {
  explainDecision(input: ExplainDecisionInput): Promise<string>;
  summarizePatterns(input: SummarizeInput): Promise<string>;
  draftTrainingScenario(spec: ScenarioSpec): Promise<Record<string, unknown>>;
}

export type Role = 'student' | 'trainer' | 'admin';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}
