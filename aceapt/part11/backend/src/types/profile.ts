import { BehaviorSignal } from './signals';

export type BehaviorLevel = 'LOW' | 'MODERATE' | 'STRONG' | 'DEVELOPING';

export interface BehaviorDimension {
  level: BehaviorLevel;
  /** Calm, evidence-grounded, student-facing sentence(s). Never a raw internal score (section 18/26). */
  explanation: string;
  confidence: number;
  evidenceCount: number;
}

/**
 * LearningBehaviorProfile (section 21): the headline, student-facing
 * behavior state (section 18). Built by domain/profileBuilder.ts by
 * interpreting the ACTIVE signals from domain/signals/index.ts - it never
 * computes anything itself.
 */
export interface LearningBehaviorProfile {
  studentId: string;
  generatedAt: string;
  /** True until the student has enough activity for the profile to be meaningful (section 44: cold start). */
  isColdStart: boolean;
  dimensions: {
    consistency: BehaviorDimension;
    sessionPattern: BehaviorDimension;
    challengeExposure: BehaviorDimension;
    persistence: BehaviorDimension;
    recovery: BehaviorDimension;
    assistanceDependency: BehaviorDimension;
    confidenceCalibration: BehaviorDimension;
    planAdherence: BehaviorDimension;
  };
  /** Full signal set (including conditional/notable-pattern signals not shown as headline dimensions), for the adaptive layer and internal dashboard. */
  signals: BehaviorSignal[];
}
