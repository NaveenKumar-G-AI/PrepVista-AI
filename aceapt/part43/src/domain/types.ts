/**
 * Core domain vocabulary for the Adaptive Diagnostic Engine.
 *
 * Nothing in this file talks to a database, an HTTP framework, or an LLM.
 * These are the shapes the engine reasons about; your existing ACEAPT
 * Student/Question/Skill models get adapted INTO these shapes by the
 * repository implementations in src/infra (see domain/ports.ts).
 */

export type DomainName = string; // e.g. "Quant", "Logical", "Verbal"
export type TopicName = string; // e.g. "Arithmetic", "Algebra"
export type SubtopicName = string; // e.g. "Percentage", "Ratio"
export type SkillId = string; // stable canonical id, e.g. "quant.arithmetic.percentage"

export interface Skill {
  id: SkillId;
  domain: DomainName;
  topic: TopicName;
  subtopic?: SubtopicName;
  label: string; // human-readable, e.g. "Percentage"
  /** If this skill node is itself a "novel application" variant of another skill. */
  isTransferSkill?: boolean;
  baseSkillId?: SkillId;
  /** Company id -> relevance weight (0-1), for goal-aware adaptation (spec section 45). */
  companyRelevance?: Record<string, number>;
  /** 0-1 relevance to placement outcomes generally (spec section 44). */
  placementRelevance?: number;
}

export type QuestionFormat = 'mcq' | 'numeric' | 'short_answer';
export type DifficultyBand = 'foundation' | 'easy' | 'medium' | 'hard' | 'advanced';

export interface Question {
  id: string;
  skillId: SkillId;
  format: QuestionFormat;
  /** Continuous Rasch-style difficulty on a logit-like scale (roughly -2.5..+2.5). */
  difficultyRating: number;
  difficultyBand: DifficultyBand;
  /** True if this item deliberately tests the skill in an unfamiliar context/representation. */
  isTransferVariant: boolean;
  isValidated: boolean;
  /** 0-1 quality score derived from your existing question-quality/psychometrics system, if any. */
  qualityScore: number;
  /** Bad-question protection (spec section 33): flagged items are excluded, never scored. */
  isFlagged: boolean;
  /** Free-form tags used for pattern-exposure tracking and representation novelty, e.g. "business-scenario". */
  tags: string[];
  /** Optional benchmark time; falls back to a per-band default if omitted. */
  expectedResponseTimeMs?: number;
  /**
   * Opaque passthrough for the question's actual renderable content (stem,
   * choices, media, etc.), owned entirely by your existing question system.
   * The engine never reads or interprets this field - it only forwards it
   * so your existing question-rendering UI can display it. This is a
   * deliberate choice: Feature 43 does not duplicate question storage or
   * rendering (spec section 4).
   */
  content?: unknown;
}

export interface StudentProfileRef {
  studentId: string;
  tenantId?: string;
}

export interface SelfReportedConfidence {
  level: 'low' | 'medium' | 'high';
}

export interface ResponseRecord {
  id: string;
  sessionId: string;
  questionId: string;
  skillId: SkillId;
  difficultyRating: number;
  /**
   * Determined by your EXISTING scoring system before this is ever called.
   * The engine trusts this input and never grades an answer itself (spec
   * section 4: "do not create duplicate scoring systems").
   */
  isCorrect: boolean;
  responseTimeMs: number;
  confidence?: SelfReportedConfidence;
  /** Optional passthrough of the raw submitted answer, for audit logging only. */
  submittedAnswer?: unknown;
  answeredAt: string; // ISO-8601
}

export type DiagnosticObjective =
  | 'general_baseline'
  | 'placement_preparation'
  | 'company_preparation'
  | 'weakness_investigation'
  | 'reassessment';

export type EvidenceConfidence = 'low' | 'moderate' | 'high';
export type CapabilityLabel = 'unknown' | 'emerging' | 'developing' | 'proficient' | 'advanced';

export interface DiagnosticConfig {
  objective: DiagnosticObjective;
  companyId?: string;
  requiredDomains: DomainName[];
  minQuestionsPerDomain: number;
  maxQuestions: number;
  minQuestions: number;
  /** The minimum evidence confidence a skill needs to reach before it's considered "resolved". */
  targetEvidenceConfidence: EvidenceConfidence;
  reassessmentBaselineSessionId?: string;
}
