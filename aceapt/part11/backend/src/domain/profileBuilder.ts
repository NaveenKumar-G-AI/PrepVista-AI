import { BehaviorEvent } from '../types/events';
import { BehaviorSignal, SignalType } from '../types/signals';
import { BehaviorDimension, BehaviorLevel, LearningBehaviorProfile } from '../types/profile';

/**
 * Behavior Profile stage (section 22, section 18). Pure interpretation
 * layer: takes the signals already computed by domain/signals/index.ts and
 * maps each of the 8 headline dimensions onto its corresponding signal.
 * This function does no calculation of its own - if a number is wrong,
 * the bug is in a detector, not here. That separation is what keeps every
 * number the student sees traceable to one specific, testable function
 * (section 25: explainability).
 */
export function buildBehaviorProfile(studentId: string, signals: BehaviorSignal[], events: BehaviorEvent[], now: Date): LearningBehaviorProfile {
  const find = (type: SignalType) => signals.find((s) => s.signalType === type);

  const dims = {
    consistency: toDimension(find('CONSISTENCY_LEVEL')),
    sessionPattern: toDimension(find('LEARNING_RHYTHM_PREFERENCE')),
    challengeExposure: toDimension(find('CHALLENGE_EXPOSURE')),
    persistence: toDimension(find('PERSISTENCE_LEVEL')),
    recovery: toDimension(find('RECOVERY_PATTERN')),
    assistanceDependency: toDimension(find('ASSISTANCE_DEPENDENCY')),
    confidenceCalibration: toDimension(find('CONFIDENCE_CALIBRATION')),
    planAdherence: toDimension(find('PLAN_ADHERENCE')),
  };

  // Cold start (section 44): true only while EVERY dimension still lacks
  // evidence - a student with one strong signal and seven pending ones is
  // not "cold start", they're partially profiled, which the UI can show
  // honestly per-dimension.
  const isColdStart = Object.values(dims).every((d) => d.level === 'DEVELOPING');

  return {
    studentId,
    generatedAt: now.toISOString(),
    isColdStart,
    dimensions: dims,
    signals,
  };
}

function toDimension(signal: BehaviorSignal | undefined): BehaviorDimension {
  if (!signal || signal.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      level: 'DEVELOPING',
      explanation: signal?.explanation ?? 'Learning behavior profile is still developing.',
      confidence: 0,
      evidenceCount: signal?.evidenceCount ?? 0,
    };
  }
  return {
    level: mapLabelToLevel(signal.signalType, signal.label),
    explanation: signal.explanation,
    confidence: signal.confidence,
    evidenceCount: signal.evidenceCount,
  };
}

/**
 * Every detector defines its own label vocabulary (documented per-signal
 * in domain/signals/*). This maps that vocabulary onto the small,
 * consistent LOW/MODERATE/STRONG scale the student-facing UI uses, so the
 * page never has to special-case a signal's internal wording (section 18:
 * "do not expose raw internal scores without interpretation").
 *
 * signalType matters, not just the label string: ASSISTANCE_DEPENDENCY is
 * the one dimension where LOW is the desirable state and HIGH is the one
 * to watch - the inverse of every other LOW/HIGH-labeled signal. Branching
 * on signalType first (rather than trying to make one string map serve
 * both meanings of "LOW") keeps that inversion explicit and correct.
 */
function mapLabelToLevel(signalType: SignalType, label: string): BehaviorLevel {
  if (signalType === 'ASSISTANCE_DEPENDENCY') {
    if (label === 'LOW') return 'STRONG';
    if (label === 'HIGH') return 'LOW';
    return 'MODERATE';
  }

  const strongLabels = new Set(['CONSISTENT', 'STRONG', 'STRONG_ACCEPTANCE', 'HIGH_COMPLETION', 'CALIBRATED']);
  const lowLabels = new Set(['HIGHLY_IRREGULAR', 'IRREGULAR', 'LOW', 'LOW_COMPLETION', 'WEAK', 'OVERCONFIDENT', 'UNDERCONFIDENT']);

  if (strongLabels.has(label)) return 'STRONG';
  if (lowLabels.has(label)) return 'LOW';
  // MODERATE, MODERATE_COMPLETION, or a session-length bucket label like "15-30 min" - all genuinely neutral.
  return 'MODERATE';
}
