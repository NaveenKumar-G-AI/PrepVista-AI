/**
 * Core domain types for Feature 14 — Adaptive Mastery & Skill Transfer
 * Intelligence Engine.
 *
 * These are deliberately framework-agnostic (no Express/DB types leak in
 * here) so this module can be lifted into a larger PrepVista/ACEAPT
 * monorepo later with minimal changes. See README.md "Integration" section.
 */

// ---------------------------------------------------------------------------
// Section 3: Mastery state model — a progression, not a boolean.
// ---------------------------------------------------------------------------
export type MasteryState =
  | 'UNSEEN'
  | 'INTRODUCED'
  | 'FAMILIAR'
  | 'GUIDED'
  | 'PRACTICING'
  | 'INDEPENDENT'
  | 'STABLE'
  | 'RETAINED'
  | 'TRANSFERRED'
  | 'ROBUST_MASTERY';

export const STATE_ORDER: MasteryState[] = [
  'UNSEEN',
  'INTRODUCED',
  'FAMILIAR',
  'GUIDED',
  'PRACTICING',
  'INDEPENDENT',
  'STABLE',
  'RETAINED',
  'TRANSFERRED',
  'ROBUST_MASTERY',
];

export function stateRank(state: MasteryState): number {
  return STATE_ORDER.indexOf(state);
}

// ---------------------------------------------------------------------------
// Question metadata dimensions (sections 6, 7, 8, 9)
// ---------------------------------------------------------------------------
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export type QuestionFormat =
  | 'direct'
  | 'word_problem'
  | 'table'
  | 'graph'
  | 'scenario'
  | 'multi_step'
  | 'data_interpretation'
  | 'applied';

/** How far a question sits from what the student has already seen. */
export type NoveltyLevel = 'seen' | 'similar' | 'varied' | 'novel';
export const NOVELTY_ORDER: NoveltyLevel[] = ['seen', 'similar', 'varied', 'novel'];

// ---------------------------------------------------------------------------
// Section 15/18/19/etc — explainable gap flags. Every one of these must be
// traceable back to a specific threshold in constants.ts.
// ---------------------------------------------------------------------------
export type GapFlag =
  | 'INSUFFICIENT_EVIDENCE'
  | 'INDEPENDENCE_GAP'
  | 'DIFFICULTY_GAP'
  | 'FORMAT_TRANSFER_GAP'
  | 'CONTEXT_TRANSFER_GAP'
  | 'TRANSFER_GAP'
  | 'RETENTION_GAP'
  | 'STABILITY_GAP'
  | 'ROOT_CAUSE_GAP'
  | 'COMPOSITION_GAP';

// ---------------------------------------------------------------------------
// Section 1/2/41 — Skill + dependency graph
// ---------------------------------------------------------------------------
export interface Skill {
  id: string;
  domain: string;
  topic: string;
  name: string;
  /** Section 2: skill dependency graph. IDs of skills this skill builds on. */
  prerequisiteIds: string[];
  /**
   * Section 20/41: forward-looking hook for multi-skill composition gaps.
   * If present, this skill is understood to be "skill A + skill B" applied
   * together (e.g. Data Interpretation = Percentage + Ratio applied to a
   * table). The prototype only uses this for a simplified detector —
   * see engine/analysisEngine.ts computeCompositionGap().
   */
  compositeOf?: string[];
}

export interface Question {
  id: string;
  skillId: string;
  prompt: string;
  difficulty: DifficultyLevel;
  format: QuestionFormat;
  novelty: NoveltyLevel;
  /** e.g. "discount", "population", "finance" — section 8 context transfer */
  context: string;
  correctAnswer: string;
  choices?: string[];
}

// ---------------------------------------------------------------------------
// Section 42 — Event tracking
// ---------------------------------------------------------------------------
export type AttemptSource = 'practice' | 'mastery_check' | 'retention_check';

export interface AttemptEvent {
  id: string;
  studentId: string;
  skillId: string;
  questionId: string;
  correct: boolean;
  /**
   * Section 5 — independence engine. False whenever a hint or solution was
   * used before the student submitted an answer, or the attempt happened
   * inside a guided walkthrough. This is the single field the entire
   * independence engine is built on.
   */
  independent: boolean;
  hintUsed: boolean;
  solutionViewed: boolean;
  retries: number;
  responseTimeMs: number;
  timestamp: string; // ISO 8601
  source: AttemptSource;
  masteryCheckId?: string;
}

export interface Student {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Section 22/23 — Mastery check blueprint + session
// ---------------------------------------------------------------------------
export type MasteryCheckStatus = 'in_progress' | 'completed' | 'abandoned';

export interface MasteryCheckBlueprint {
  targetSkillId: string;
  questionCount: number;
  difficulties: DifficultyLevel[];
  formats: QuestionFormat[];
  novelApplicationCount: number;
  purpose: string;
}

export interface MasteryCheck {
  id: string;
  studentId: string;
  skillId: string;
  blueprint: MasteryCheckBlueprint;
  questionIds: string[];
  status: MasteryCheckStatus;
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Section 4/13/14 — Evidence + analysis produced by the deterministic engine
// ---------------------------------------------------------------------------
export interface DimensionBreakdown<K extends string> {
  byKey: Record<K, { attempts: number; correct: number; accuracy: number | null }>;
}

export interface SkillEvidence {
  skillId: string;
  totalAttempts: number;
  independentAttempts: number;
  independentDistinctQuestions: number;
  guidedAccuracy: number | null;
  /** Recency-weighted — see THRESHOLDS.RECENT_WINDOW_SIZE. Used for state gating. */
  independentAccuracy: number | null;
  /** True all-time average. Shown to students for transparency; not used for gating. */
  lifetimeIndependentAccuracy: number | null;
  byDifficulty: Record<DifficultyLevel, { attempts: number; correct: number; accuracy: number | null }>;
  byFormat: Record<QuestionFormat, { attempts: number; correct: number; accuracy: number | null }>;
  byNovelty: Record<NoveltyLevel, { attempts: number; correct: number; accuracy: number | null }>;
  byContext: Record<string, { attempts: number; correct: number; accuracy: number | null }>;
  familiarAccuracy: number | null; // seen + similar
  novelAccuracy: number | null; // varied + novel
  novelIndependentAttempts: number;
  retention: {
    immediateAccuracy: number | null;
    delayedAccuracy: number | null;
    delayedAttempts: number;
  };
  hintUsageRate: number;
  avgRetries: number;
  rollingAccuracies: number[]; // sliding-window accuracies, most recent last
  lastAttemptAt: string | null;
}

export interface SkillAnalysis {
  skillId: string;
  evidence: SkillEvidence;
  sufficiency: 'SUFFICIENT' | 'INSUFFICIENT';
  difficultyCeiling: DifficultyLevel | null;
  stability: 'STABLE' | 'UNSTABLE' | 'INSUFFICIENT';
  flags: GapFlag[];
  state: MasteryState;
  displayLabel: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  rootCauseSkillIds: string[];
  nextAction: string;
}

// ---------------------------------------------------------------------------
// Section 16/17/34 — transition log (append-only, auditable)
// ---------------------------------------------------------------------------
export interface MasteryTransition {
  id: string;
  studentId: string;
  skillId: string;
  fromState: MasteryState;
  toState: MasteryState;
  reason: string;
  triggeredBy: 'practice' | 'mastery_check_completed' | 'retention_check_completed';
  evidenceSnapshot: SkillEvidence;
  timestamp: string;
}

export interface MasterySnapshot {
  id: string;
  studentId: string;
  skillId: string;
  analysis: SkillAnalysis;
  timestamp: string;
}
