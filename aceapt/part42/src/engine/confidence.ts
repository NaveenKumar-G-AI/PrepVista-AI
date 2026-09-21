/** Module 8 — the fixed confidence scale used everywhere in the engine. */
export const CONFIDENCE_SCALE = {
  1: "Guessing",
  2: "Unsure",
  3: "Somewhat confident",
  4: "Confident",
  5: "Very confident",
} as const;

export interface ConfidenceObservation {
  confidence: 1 | 2 | 3 | 4 | 5;
  isCorrect: boolean;
}

export type CalibrationPattern = "overconfident" | "underconfident" | "well_calibrated" | "insufficient_evidence";

export interface ConfidenceCalibrationResult {
  highConfidenceCount: number;
  highConfidenceWrongCount: number;
  highConfidenceWrongRate: number | null;
  lowConfidenceCount: number;
  lowConfidenceCorrectCount: number;
  lowConfidenceCorrectRate: number | null;
  overconfident: boolean;
  underconfident: boolean;
  pattern: CalibrationPattern;
}

// Module 9: "Do not diagnose based on one question. Require repeated evidence."
const MIN_BUCKET_EVIDENCE = 3;
const OVERCONFIDENCE_THRESHOLD = 0.4; // >40% of confident answers wrong
const UNDERCONFIDENCE_THRESHOLD = 0.6; // >60% of unsure answers actually correct

/**
 * Module 9 — compares stated confidence against actual correctness across
 * a set of observations (skill-level or domain-level; caller decides scope).
 * Confidence questions are asked strategically (Module 8), so the input set
 * may be small — that's exactly why this refuses to call a pattern until
 * MIN_BUCKET_EVIDENCE is met in the relevant bucket.
 */
export function assessConfidenceCalibration(observations: ConfidenceObservation[]): ConfidenceCalibrationResult {
  const highConf = observations.filter((o) => o.confidence >= 4);
  const lowConf = observations.filter((o) => o.confidence <= 2);

  const highConfidenceWrongCount = highConf.filter((o) => !o.isCorrect).length;
  const lowConfidenceCorrectCount = lowConf.filter((o) => o.isCorrect).length;

  const highConfidenceWrongRate = highConf.length > 0 ? highConfidenceWrongCount / highConf.length : null;
  const lowConfidenceCorrectRate = lowConf.length > 0 ? lowConfidenceCorrectCount / lowConf.length : null;

  const overconfident = highConf.length >= MIN_BUCKET_EVIDENCE && (highConfidenceWrongRate ?? 0) > OVERCONFIDENCE_THRESHOLD;
  const underconfident = lowConf.length >= MIN_BUCKET_EVIDENCE && (lowConfidenceCorrectRate ?? 0) > UNDERCONFIDENCE_THRESHOLD;

  let pattern: CalibrationPattern = "insufficient_evidence";
  if (overconfident) pattern = "overconfident";
  else if (underconfident) pattern = "underconfident";
  else if (highConf.length >= MIN_BUCKET_EVIDENCE || lowConf.length >= MIN_BUCKET_EVIDENCE) pattern = "well_calibrated";

  return {
    highConfidenceCount: highConf.length,
    highConfidenceWrongCount,
    highConfidenceWrongRate,
    lowConfidenceCount: lowConf.length,
    lowConfidenceCorrectCount,
    lowConfidenceCorrectRate,
    overconfident,
    underconfident,
    pattern,
  };
}

/**
 * Module 8 — decides whether THIS question should ask for a confidence
 * rating. Strategic, not every-question: ask on roughly every 3rd question,
 * plus always on the first question of each skill node (to seed a baseline)
 * and never twice in a row regardless of the modulo, to avoid feeling
 * mechanical.
 */
export function shouldAskConfidence(questionIndexInSession: number, isFirstForSkill: boolean): boolean {
  if (isFirstForSkill) return true;
  return questionIndexInSession % 3 === 0;
}
