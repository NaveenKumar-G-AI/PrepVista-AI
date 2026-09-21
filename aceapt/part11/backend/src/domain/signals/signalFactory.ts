import { randomUUID } from 'crypto';
import { BehaviorSignal, SignalSeverity, SignalStatus, SignalType } from '../../types/signals';

/** Shared constructor so every detector produces a consistently-shaped BehaviorSignal (section 19). */
export function makeSignal<M extends Record<string, unknown>>(args: {
  studentId: string;
  signalType: SignalType;
  label: string;
  severity: SignalSeverity;
  confidence: number;
  evidenceCount: number;
  observationWindowDays: number;
  supportingMetrics: M;
  explanation: string;
  possibleExplanations?: string[];
}): BehaviorSignal<M> {
  const now = new Date().toISOString();
  return {
    signalId: randomUUID(),
    studentId: args.studentId,
    signalType: args.signalType,
    label: args.label,
    severity: args.severity,
    confidence: args.confidence,
    evidenceCount: args.evidenceCount,
    observationWindowDays: args.observationWindowDays,
    supportingMetrics: args.supportingMetrics,
    explanation: args.explanation,
    possibleExplanations: args.possibleExplanations,
    createdAt: now,
    updatedAt: now,
    status: 'ACTIVE' as SignalStatus,
  };
}

/**
 * Cold-start / not-enough-data output (section 25, section 44). Every
 * "always-on" detector returns this instead of guessing when it doesn't
 * have enough to say anything - never a fabricated profile.
 */
export function insufficientEvidenceSignal(args: {
  studentId: string;
  signalType: SignalType;
  observationWindowDays: number;
  explanation: string;
}): BehaviorSignal {
  const now = new Date().toISOString();
  return {
    signalId: randomUUID(),
    studentId: args.studentId,
    signalType: args.signalType,
    label: 'INSUFFICIENT_EVIDENCE',
    severity: 'INFO',
    confidence: 0,
    evidenceCount: 0,
    observationWindowDays: args.observationWindowDays,
    supportingMetrics: {},
    explanation: args.explanation,
    createdAt: now,
    updatedAt: now,
    status: 'INSUFFICIENT_EVIDENCE' as SignalStatus,
  };
}
