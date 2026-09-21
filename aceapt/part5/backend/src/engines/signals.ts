import {
  ConfidenceCalibration,
  ConfidenceLevel,
  PerformanceInterpretation,
  RelativeSpeed,
} from "../domain/enums";
import { Attempt, SkillPracticeState } from "../domain/types";

/**
 * Relative speed (§13) — deliberately relative, not absolute. A raw ratio
 * against the question's expected time, nudged by the student's own recent
 * pace on this skill so a naturally careful solver isn't branded "slow"
 * every single time.
 */
export function computeRelativeSpeed(
  totalTimeMs: number,
  expectedTimeMs: number,
  studentAverageTimeSeconds: number
): RelativeSpeed {
  const expectedSeconds = expectedTimeMs / 1000;
  const paceFactor =
    studentAverageTimeSeconds > 0 && expectedSeconds > 0
      ? clampPaceFactor(studentAverageTimeSeconds / expectedSeconds)
      : 1;
  const adjustedExpectedMs = expectedTimeMs * paceFactor;
  const ratio = totalTimeMs / adjustedExpectedMs;

  if (ratio <= 0.7) return RelativeSpeed.FAST;
  if (ratio >= 1.3) return RelativeSpeed.SLOW;
  return RelativeSpeed.ON_PACE;
}

function clampPaceFactor(factor: number): number {
  // Never let personal pace history swing the expectation by more than 30%
  // in either direction — keeps a single outlier attempt from distorting things.
  return Math.max(0.7, Math.min(1.3, factor));
}

/** §12 — combines accuracy and speed into one interpreted signal with plain-language meaning. */
export function interpretPerformance(
  isCorrect: boolean,
  relativeSpeed: RelativeSpeed
): { interpretation: PerformanceInterpretation; explanation: string } {
  if (isCorrect && relativeSpeed !== RelativeSpeed.SLOW) {
    return { interpretation: PerformanceInterpretation.ACCURATE_FAST, explanation: "Strong performance — accurate and quick." };
  }
  if (isCorrect && relativeSpeed === RelativeSpeed.SLOW) {
    return {
      interpretation: PerformanceInterpretation.ACCURATE_SLOW,
      explanation: "The understanding is there, but it's not fluent yet.",
    };
  }
  if (!isCorrect && relativeSpeed === RelativeSpeed.FAST) {
    return {
      interpretation: PerformanceInterpretation.FAST_INACCURATE,
      explanation: "Answered quickly but incorrectly — often a careless or conceptual slip rather than not knowing the material at all.",
    };
  }
  return {
    interpretation: PerformanceInterpretation.SLOW_INACCURATE,
    explanation: "Took time and still got it wrong — usually a sign of a deeper gap worth repairing directly.",
  };
}

/** §14 — compares stated confidence against the actual outcome. */
export function classifyConfidenceCalibration(
  confidence: ConfidenceLevel | null,
  isCorrect: boolean
): ConfidenceCalibration {
  if (confidence === null) return ConfidenceCalibration.UNKNOWN;
  const confidentButWrong = confidence >= ConfidenceLevel.CONFIDENT && !isCorrect;
  const unsureButRight = confidence <= ConfidenceLevel.UNSURE && isCorrect;
  if (confidentButWrong) return ConfidenceCalibration.OVERCONFIDENT;
  if (unsureButRight) return ConfidenceCalibration.UNDERCONFIDENT;
  return ConfidenceCalibration.CALIBRATED;
}

export interface FatigueAssessment {
  fatigued: boolean;
  signals: string[];
  recommendation: "NONE" | "SUGGEST_BREAK" | "SUGGEST_SHORTER_SESSION" | "SUGGEST_EASIER_CONSOLIDATION";
}

/**
 * §29 — heuristic only, explicitly not a medical/clinical judgment. Looks at
 * the last few attempts within the *current session* for creeping response
 * time, dropping accuracy, and rapid-guess patterns.
 */
export function detectFatigue(sessionAttempts: Attempt[]): FatigueAssessment {
  const signals: string[] = [];
  const recent = sessionAttempts.slice(-6);
  if (recent.length < 4) {
    return { fatigued: false, signals, recommendation: "NONE" };
  }

  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));

  const avg = (arr: Attempt[]) => arr.reduce((s, a) => s + a.totalTimeMs, 0) / arr.length;
  const accuracy = (arr: Attempt[]) => arr.filter((a) => a.isCorrect).length / arr.length;

  const timeGrew = avg(secondHalf) > avg(firstHalf) * 1.25;
  const accuracyDropped = accuracy(secondHalf) < accuracy(firstHalf) - 0.25;
  const rapidGuesses = secondHalf.filter((a) => !a.isCorrect && a.totalTimeMs < a.expectedTimeMs * 0.3).length;

  if (timeGrew) signals.push("Response time has been creeping up this session.");
  if (accuracyDropped) signals.push("Accuracy has dropped in the second half of this session.");
  if (rapidGuesses >= 2) signals.push("Multiple very fast wrong answers — looks like rapid guessing.");

  const fatigued = signals.length >= 2;
  let recommendation: FatigueAssessment["recommendation"] = "NONE";
  if (fatigued) {
    recommendation = rapidGuesses >= 2 ? "SUGGEST_BREAK" : "SUGGEST_SHORTER_SESSION";
  } else if (signals.length === 1 && accuracyDropped) {
    recommendation = "SUGGEST_EASIER_CONSOLIDATION";
  }

  return { fatigued, signals, recommendation };
}

/** Rolling-window recompute of the aggregate SkillPracticeState fields after a new attempt. */
export function foldAttemptIntoState(state: SkillPracticeState, attempt: Attempt, windowSize = 10): Partial<SkillPracticeState> {
  const attemptCount = state.attemptCount + 1;
  const correctCount = state.correctCount + (attempt.isCorrect ? 1 : 0);

  // Recent accuracy uses an exponential-ish blend so it responds to recent
  // performance faster than the lifetime average would, without needing to
  // re-query full history every time.
  const alpha = 1 / Math.min(windowSize, attemptCount);
  const recentAccuracy = state.recentAccuracy + alpha * ((attempt.isCorrect ? 1 : 0) - state.recentAccuracy);
  const averageTimeSeconds = state.averageTimeSeconds + alpha * (attempt.totalTimeMs / 1000 - state.averageTimeSeconds);
  const hintUsageRate = state.hintUsageRate + alpha * (attempt.hintsUsed - state.hintUsageRate);

  const streak = attempt.isCorrect ? Math.max(1, state.streak + 1) : Math.min(-1, state.streak - 1);

  const errorDistribution = { ...state.errorDistribution };
  if (attempt.errorCategory) {
    errorDistribution[attempt.errorCategory] = (errorDistribution[attempt.errorCategory] ?? 0) + 1;
  }

  const difficultyExposure = { ...state.difficultyExposure };
  const lvl = attempt.difficultyAtAttempt.level;
  difficultyExposure[lvl] = (difficultyExposure[lvl] ?? 0) + 1;

  return {
    attemptCount,
    correctCount,
    recentAccuracy,
    averageTimeSeconds,
    hintUsageRate,
    streak,
    errorDistribution,
    difficultyExposure,
    lastPracticed: attempt.createdAt,
  };
}
