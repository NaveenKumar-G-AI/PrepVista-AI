import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { mean, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Confidence Calibration (section 8). Requires CONFIDENCE_RECORDED events
 * paired with a QUESTION_ANSWERED outcome shortly after. Per the brief:
 * "Never fabricate confidence data if the existing system does not capture
 * it." If the frontend never sends CONFIDENCE_RECORDED events, this always
 * returns NO_DATA - it does not estimate, guess, or infer confidence from
 * anything else. The event type and API contract already exist for when
 * the frontend starts capturing it (see types/events.ts).
 */
export function detectConfidenceCalibrationSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays).sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  const confidenceEvents = windowed.filter((e) => e.type === 'CONFIDENCE_RECORDED' && typeof e.confidencePercent === 'number');

  if (confidenceEvents.length === 0) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'CONFIDENCE_CALIBRATION',
      observationWindowDays: windowDays,
      explanation: 'Confidence capture is not yet in use for this student, so calibration cannot be measured.',
    });
  }

  if (confidenceEvents.length < THRESHOLDS.confidenceCalibration.MIN_RECORDED_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'CONFIDENCE_CALIBRATION',
      observationWindowDays: windowDays,
      explanation: `Only ${confidenceEvents.length} confidence rating(s) recorded so far - not yet enough to determine a calibration pattern.`,
    });
  }

  const pairs: { confidence: number; correct: boolean }[] = [];
  for (const ce of confidenceEvents) {
    const match = windowed.find(
      (e) =>
        e.type === 'QUESTION_ANSWERED' &&
        e.sessionId === ce.sessionId &&
        e.questionId === ce.questionId &&
        typeof e.correct === 'boolean' &&
        new Date(e.occurredAtUtc).getTime() >= new Date(ce.occurredAtUtc).getTime(),
    );
    if (match) pairs.push({ confidence: ce.confidencePercent as number, correct: match.correct as boolean });
  }

  if (pairs.length === 0) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'CONFIDENCE_CALIBRATION',
      observationWindowDays: windowDays,
      explanation: 'Confidence ratings were recorded but could not be matched to an answered outcome yet.',
    });
  }

  const avgConfidence = mean(pairs.map((p) => p.confidence));
  const actualCorrectRate = pairs.filter((p) => p.correct).length / pairs.length * 100;
  const gap = avgConfidence - actualCorrectRate;

  const label =
    gap >= THRESHOLDS.confidenceCalibration.MISMATCH_MIN_GAP_POINTS
      ? 'OVERCONFIDENT'
      : gap <= -THRESHOLDS.confidenceCalibration.MISMATCH_MIN_GAP_POINTS
        ? 'UNDERCONFIDENT'
        : 'CALIBRATED';

  const confidence = computeSignalConfidence({ evidenceCount: pairs.length, recencyDays: 0, patternConsistency: 1 });

  const explanation =
    label === 'OVERCONFIDENT'
      ? `Your average self-reported confidence (${Math.round(avgConfidence)}%) has been running ahead of your actual accuracy (${Math.round(actualCorrectRate)}%) across ${pairs.length} rated answers. Double-checking before submitting may help.`
      : label === 'UNDERCONFIDENT'
        ? `Your actual accuracy (${Math.round(actualCorrectRate)}%) has been running ahead of your self-reported confidence (${Math.round(avgConfidence)}%) across ${pairs.length} rated answers - you may be more prepared than you feel.`
        : `Your self-reported confidence (${Math.round(avgConfidence)}%) closely tracks your actual accuracy (${Math.round(actualCorrectRate)}%) across ${pairs.length} rated answers - well calibrated.`;

  return makeSignal({
    studentId,
    signalType: 'CONFIDENCE_CALIBRATION',
    label,
    severity: 'INFO',
    confidence,
    evidenceCount: pairs.length,
    observationWindowDays: windowDays,
    supportingMetrics: { ratedAnswers: pairs.length, avgConfidencePercent: round2(avgConfidence), actualAccuracyPercent: round2(actualCorrectRate), gapPoints: round2(gap) },
    explanation,
  });
}
