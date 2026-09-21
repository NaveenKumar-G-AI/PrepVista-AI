/** Behavior Signal Model (spec section 19). */
export type SignalType =
  | 'CONSISTENCY_LEVEL'
  | 'RETURNING_STUDENT'
  | 'SESSION_BEHAVIOR_SUMMARY'
  | 'REPEATED_SESSION_ABANDONMENT'
  | 'CHALLENGE_EXPOSURE'
  | 'PERSISTENCE_LEVEL'
  | 'RECOVERY_PATTERN'
  | 'ASSISTANCE_DEPENDENCY'
  | 'CONFIDENCE_CALIBRATION'
  | 'PLAN_ADHERENCE'
  | 'PLAN_REALISM_MISMATCH'
  | 'LEARNING_RHYTHM_PREFERENCE'
  | 'CRAMMING_PATTERN'
  | 'QUESTION_FRICTION'
  | 'PRACTICE_DISTRIBUTION_IMBALANCE'
  | 'WORKLOAD_MISMATCH';

export type SignalSeverity = 'INFO' | 'WATCH' | 'NOTABLE';

export type SignalStatus = 'ACTIVE' | 'INSUFFICIENT_EVIDENCE';

export interface BehaviorSignal<TMetrics extends Record<string, unknown> = Record<string, unknown>> {
  signalId: string;
  studentId: string;
  signalType: SignalType;
  /** Categorical label, e.g. 'LOW' | 'MODERATE' | 'STRONG'. Each signal documents its own label set. */
  label: string;
  severity: SignalSeverity;
  /** 0-1. See domain/signals/confidenceScore.ts for how this is derived. */
  confidence: number;
  evidenceCount: number;
  observationWindowDays: number;
  supportingMetrics: TMetrics;
  /** Calm, student-facing sentence(s), grounded in supportingMetrics. Never a raw score (section 25/26). */
  explanation: string;
  /** Ordered list of plausible, non-diagnostic explanations - used where a pattern has more than one likely cause (section 3). */
  possibleExplanations?: string[];
  createdAt: string;
  updatedAt: string;
  status: SignalStatus;
}
