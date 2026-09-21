// Deterministic, always-available feedback copy. This is what the product
// shows when AI coaching is disabled or fails (spec 80: "AI must be
// optional"), and it also defines the tone rules (spec 73) that AI-enriched
// copy must preserve.

import { SpeedAttemptRecord, SpeedPerformanceState } from '../types/domain';

// Phrases the product must never say to a student (spec 73). Exported so
// tests can scan every generated message for accidental regressions.
export const BANNED_PHRASES = ["you're too slow", 'you are too slow', "you're rushing", 'you are rushing', 'failed speed level'];

export interface AttemptFeedback {
  status: string;
  detail: string;
}

export function perAttemptFeedback(attempt: SpeedAttemptRecord, guardrail: number, rollingAccuracy: number): AttemptFeedback {
  const seconds = Math.round(attempt.responseTimeMs / 1000);

  if (!attempt.correct) {
    if (attempt.performanceState === SpeedPerformanceState.FAST_INACCURATE) {
      return { status: 'Too fast for current accuracy', detail: `${seconds}s - let's ease off the pace slightly on the next one.` };
    }
    return { status: 'Incorrect', detail: `${seconds}s - worth a closer look at this one.` };
  }

  switch (attempt.performanceState) {
    case SpeedPerformanceState.FAST_ACCURATE:
      return { status: 'Faster and accurate', detail: `${seconds}s - right where we want it.` };
    case SpeedPerformanceState.SLOW_ACCURATE:
      return { status: 'Accurate, room to speed up', detail: `${seconds}s - correct, and there may be time to reclaim here.` };
    default:
      return {
        status: rollingAccuracy >= guardrail ? 'Within safe range' : 'Correct',
        detail: `${seconds}s - correct.`,
      };
  }
}

export interface SessionStats {
  avgMs: number;
  accuracy: number;
}

export interface SessionSummary {
  headline: string;
  time: { beforeSec: number; afterSec: number };
  accuracy: { before: number; after: number };
  mainImprovement: string;
  mainCaution: string | null;
  nextFocus: string;
}

export function sessionSummary(
  before: SessionStats,
  after: SessionStats,
  mainImprovement: string,
  mainCaution: string | null,
  nextFocus: string,
): SessionSummary {
  const fasterWithoutLosingControl = after.avgMs > 0 && after.avgMs < before.avgMs && after.accuracy >= before.accuracy - 0.03;
  return {
    headline: fasterWithoutLosingControl ? 'Faster without losing control' : 'Session complete',
    time: { beforeSec: Math.round(before.avgMs / 1000), afterSec: Math.round(after.avgMs / 1000) },
    accuracy: { before: before.accuracy, after: after.accuracy },
    mainImprovement,
    mainCaution,
    nextFocus,
  };
}

/** Utility used by tests (and safe to call in CI) to guard against banned tone. */
export function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.some((phrase) => lower.includes(phrase));
}
