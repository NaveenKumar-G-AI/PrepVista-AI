import type { ErrorType } from "./errorTaxonomy.js";

/** §14 — dimensions the accuracy profile can be sliced along. */
export type AccuracyScope =
  | "overall"
  | "skill"
  | "difficulty"
  | "question_type"
  | "timed"
  | "untimed"
  | "novel"
  | "familiar"
  | "guided"
  | "independent"
  | "session_position";

/** §15 — never silently turn "no attempts" into "inaccurate". */
export type ConfidenceLevel = "insufficient" | "low" | "moderate" | "high";

export interface AccuracyResult {
  scope: AccuracyScope;
  scopeId: string | null;
  accuracy: number | null; // null when confidence === "insufficient"
  independentAccuracy: number | null;
  timedAccuracy: number | null;
  novelAccuracy: number | null;
  sampleSize: number;
  confidence: ConfidenceLevel;
}

/**
 * The normalized shape every domain/policy function in Feature 51 operates
 * on. Rows come from accuracy_training_attempt, already joined against the
 * upstream signals (novelty from F49, hint level from F48, pace from F50,
 * question validity from F53/54) at write time — see AttemptContext in
 * src/types/training.ts and src/ports for how those signals get attached.
 */
export interface AttemptRecord {
  id: string;
  studentId: string;
  sessionId: string;
  questionId: string;
  skillId: string;
  sequenceNumber: number;
  isCorrect: boolean;
  firstErrorStep: number | null;
  stepResults: Array<{ step: number; correct: boolean }> | null;
  errorType: ErrorType | null;
  difficulty: "easy" | "medium" | "hard";
  isNovel: boolean;
  hintLevel: "independent" | "guided" | "hint_used";
  responseTimeMs: number | null;
  expectedTimeMs: number | null;
  selfCorrected: boolean;
  questionValid: boolean;
  sessionPositionPct: number | null; // 0-100
  createdAt: string; // ISO timestamp
}

/** §92 — evidence thresholds. Tunable in one place. */
export const EVIDENCE_THRESHOLDS = {
  /** Fewer attempts than this and we report "insufficient evidence" (§15). */
  minSampleForAnyClaim: 3,
  /** Below this, we still show a number but flag it low-confidence. */
  minSampleForModerate: 6,
  /** At/above this, confidence is "high". */
  minSampleForHigh: 12
} as const;

export function confidenceForSampleSize(n: number): ConfidenceLevel {
  if (n < EVIDENCE_THRESHOLDS.minSampleForAnyClaim) return "insufficient";
  if (n < EVIDENCE_THRESHOLDS.minSampleForModerate) return "low";
  if (n < EVIDENCE_THRESHOLDS.minSampleForHigh) return "moderate";
  return "high";
}
