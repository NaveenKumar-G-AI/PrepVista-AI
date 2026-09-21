/**
 * §57-59, §75, §82-86 — the signals Feature 51 produces for other ACEAPT
 * features to consume. Feature 51 only ever WRITES these (produce side);
 * consuming them is the responsibility of whichever feature owns that
 * capability once it exists in the real repository — see README §"What's
 * stubbed" for the honest boundary here.
 */
export interface SignalPayloadMap {
  /** → Speed Training (F50), §57/§123 */
  PRESSURE_REDUCTION_SIGNAL: { skillId: string; dropPts: number; reason: string };
  /** → Speed Training (F50), §57/§124 */
  PACE_INCREASE_OK_SIGNAL: { skillId: string; dropPts: number; reason: string };
  /** → Anti-Memorization (F49), §58/§125 */
  TRANSFER_PRECISION_SIGNAL: { skillId: string; gapPts: number; reason: string };
  /** → Hint Intelligence / Anti-Memorization (F48/F49), §59/§126 */
  ASSISTANCE_DEPENDENCY_SIGNAL: { skillId: string; gapPts: number; reason: string };
  /** → Mastery (F36/37), §82 */
  MASTERY_EVIDENCE_SIGNAL: {
    skillId: string;
    independentAccuracy: number | null;
    timedAccuracy: number | null;
    novelAccuracy: number | null;
    sampleSize: number;
  };
  /** → Retention (F39/40), §83 */
  RETENTION_EVIDENCE_SIGNAL: { skillId: string; accuracy: number; sampleSize: number; measuredAt: string };
  /** → Readiness, §86 */
  READINESS_ACCURACY_SIGNAL: {
    overallAccuracy: number | null;
    independentAccuracy: number | null;
    timedAccuracy: number | null;
    consistency: string;
  };
  /** → Personal Mistake Bank / Error Pattern Intelligence, §52/§78/§79/§121 */
  REGRESSION_DETECTED_SIGNAL: { errorType: string; skillId: string | null; reason: string };
}

export type SignalType = keyof SignalPayloadMap;
