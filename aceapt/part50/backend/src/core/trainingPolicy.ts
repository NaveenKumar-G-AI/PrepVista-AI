// Training Policy: turns a rolling window of attempts into a pressure/mode
// decision. This is the piece the spec is most insistent about getting
// right (sections 29-31, 40-41, 53-58, 112-115, 128-133, 139) - it is
// deliberately deterministic (no AI) per spec section 79.

import {
  BottleneckType,
  SpeedAttemptRecord,
  SpeedPerformanceState,
  TrainingMode,
  TrainingPolicyDecision,
} from '../types/domain';
import { SpeedBaseline } from '../types/domain';

const WINDOW_SIZE = 5;
const MIN_ATTEMPTS_FOR_DECISION = 3;
const ACCURACY_DROP_TOLERANCE = 0.08; // 8 points below guardrail before we react
const TARGET_RAMP_STEP_RATIO = 0.05; // ramp target down ~5% per step, never in a jump (spec 112)
const MIN_TARGET_RATIO_OF_BASELINE = 0.65; // safety floor - never ramp below 65% of true baseline on session evidence alone
const RUSHING_RELIEF_RATIO = 1.08; // ease target back up ~8% when rushing is detected

export interface TrainingPolicyContext {
  /** Chronological, most-recent-last, already classified via speedAnalysis. Can span sessions. */
  recentAttempts: SpeedAttemptRecord[];
  /** Chronological attempts from the CURRENT session only - used for the fatigue heuristic. */
  sessionAttempts: SpeedAttemptRecord[];
  baseline: SpeedBaseline | null;
  guardrailAccuracy: number;
  currentTargetMs: number | null;
  currentMode: TrainingMode;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function accuracyOf(list: SpeedAttemptRecord[]): number {
  if (list.length === 0) return 0;
  return list.filter((a) => a.correct).length / list.length;
}

function avgTime(list: SpeedAttemptRecord[]): number {
  if (list.length === 0) return 0;
  return list.reduce((s, a) => s + a.responseTimeMs, 0) / list.length;
}

const FAST_STATES = new Set([SpeedPerformanceState.FAST_ACCURATE, SpeedPerformanceState.FAST_INACCURATE]);
const SLOW_STATES = new Set([SpeedPerformanceState.SLOW_ACCURATE, SpeedPerformanceState.SLOW_INACCURATE]);
const NOT_SLOW_STATES = new Set([
  SpeedPerformanceState.FAST_ACCURATE,
  SpeedPerformanceState.FAST_INACCURATE,
  SpeedPerformanceState.ON_PACE_ACCURATE,
  SpeedPerformanceState.ON_PACE_INACCURATE,
]);

function isMostlyFast(window: SpeedAttemptRecord[]): boolean {
  const fast = window.filter((a) => FAST_STATES.has(a.performanceState)).length;
  return fast / window.length >= 0.6;
}

function isMostlySlow(window: SpeedAttemptRecord[]): boolean {
  const slow = window.filter((a) => SLOW_STATES.has(a.performanceState)).length;
  return slow / window.length >= 0.6;
}

function isMostlyFastOrOnPace(window: SpeedAttemptRecord[]): boolean {
  const ok = window.filter((a) => NOT_SLOW_STATES.has(a.performanceState)).length;
  return ok / window.length >= 0.6;
}

/** Late-session pattern only: times rising and accuracy falling in the
 * second half of THIS session versus the first half. Deliberately narrow so
 * it never masquerades as a knowledge-gap or rushing verdict (spec 114, 139). */
function detectFatigueLikely(ctx: TrainingPolicyContext): boolean {
  const s = ctx.sessionAttempts;
  if (s.length < 6) return false;
  const mid = Math.floor(s.length / 2);
  const early = s.slice(0, mid);
  const late = s.slice(mid);
  const earlyAcc = accuracyOf(early);
  const lateAcc = accuracyOf(late);
  const earlyTime = avgTime(early);
  const lateTime = avgTime(late);
  if (earlyTime === 0) return false;
  return lateTime > earlyTime * 1.15 && lateAcc < earlyAcc - 0.1;
}

function rampTarget(ctx: TrainingPolicyContext): number | null {
  if (ctx.currentTargetMs === null) return null;
  const floor = ctx.baseline ? Math.round(ctx.baseline.averageMs * MIN_TARGET_RATIO_OF_BASELINE) : 0;
  const stepped = Math.round(ctx.currentTargetMs * (1 - TARGET_RAMP_STEP_RATIO));
  return Math.max(stepped, floor);
}

function hold(
  ctx: TrainingPolicyContext,
  signal: TrainingPolicyDecision['signal'],
  message: string,
  evidence: string[],
  requiresCoachingNarrative = false,
): TrainingPolicyDecision {
  return {
    signal,
    pressureAction: 'HOLD',
    nextMode: ctx.currentMode,
    nextTargetMs: ctx.currentTargetMs,
    message,
    evidence,
    requiresCoachingNarrative,
  };
}

export function evaluateTrainingPolicy(ctx: TrainingPolicyContext): TrainingPolicyDecision {
  const window = ctx.recentAttempts.slice(-WINDOW_SIZE);

  if (window.length < MIN_ATTEMPTS_FOR_DECISION) {
    return hold(ctx, 'INSUFFICIENT_DATA', 'Not enough attempts yet in this session to adjust pace.', []);
  }

  // Priority 1: fatigue - a narrow, specific pattern that must not be read as
  // a skill regression (spec 114, 139).
  if (detectFatigueLikely(ctx)) {
    return hold(
      ctx,
      BottleneckType.UNKNOWN,
      'Your pace is slipping and accuracy is dipping later in this session - that can be fatigue rather than a real skill regression. Consider a short break.',
      ['Response time rising and accuracy falling in the later portion of this session compared with the earlier portion.'],
      true,
    );
  }

  const accuracy = accuracyOf(window);
  const mostlyFast = isMostlyFast(window);
  const mostlySlow = isMostlySlow(window);
  const accuracyBelowGuardrail = accuracy < ctx.guardrailAccuracy - ACCURACY_DROP_TOLERANCE;

  // Priority 2: rushing - fast AND inaccurate (spec 25, 55, 130-131).
  if (accuracyBelowGuardrail && mostlyFast) {
    return {
      signal: BottleneckType.RUSHING,
      pressureAction: 'DECREASE',
      nextMode: TrainingMode.BALANCED,
      nextTargetMs: ctx.currentTargetMs ? Math.round(ctx.currentTargetMs * RUSHING_RELIEF_RATIO) : null,
      message: "Your pace increased, but accuracy dropped. Let's return to a safer pace and focus on efficient decisions.",
      evidence: [`Accuracy fell to ${pct(accuracy)} while your response times dropped below your usual pace.`],
      requiresCoachingNarrative: true,
    };
  }

  // Priority 3: knowledge/strategy gap - inaccurate without being fast
  // (spec 42-43, 57, 108, 128 Case D). Never push speed here.
  if (accuracyBelowGuardrail) {
    return {
      signal: BottleneckType.KNOWLEDGE_GAP,
      pressureAction: 'DECREASE',
      nextMode: TrainingMode.BALANCED,
      nextTargetMs: ctx.currentTargetMs,
      message: 'Your accuracy needs to stabilize before we increase time pressure. Let\'s shore up the underlying concept first.',
      evidence: [`Accuracy is ${pct(accuracy)}, below your ${pct(ctx.guardrailAccuracy)} guardrail, even without unusual time pressure.`],
      requiresCoachingNarrative: true,
    };
  }

  // Priority 4: hesitation - slow but accurate (spec 24, 56, 132).
  if (mostlySlow && accuracy >= ctx.guardrailAccuracy) {
    return {
      signal: BottleneckType.HESITATION,
      pressureAction: 'HOLD',
      nextMode: TrainingMode.DECISION,
      nextTargetMs: ctx.currentTargetMs,
      message: "Your accuracy is strong. Let's work on reducing unnecessary decision time rather than pushing raw speed.",
      evidence: ['Recent responses are consistently slower than your baseline despite strong accuracy.'],
      requiresCoachingNarrative: true,
    };
  }

  // Priority 5: stable improvement - accurate, and fast or on pace, so it is
  // safe to nudge the target down a little (spec 30, 41, 112, 128 Case A).
  if (accuracy >= ctx.guardrailAccuracy && isMostlyFastOrOnPace(window) && !mostlySlow) {
    const nextTarget = rampTarget(ctx);
    const rampedDown = nextTarget !== null && ctx.currentTargetMs !== null && nextTarget < ctx.currentTargetMs;
    return {
      signal: 'STABLE_IMPROVING',
      pressureAction: rampedDown ? 'INCREASE' : 'HOLD',
      nextMode: ctx.currentMode,
      nextTargetMs: nextTarget,
      message: rampedDown
        ? 'Your pace improved while accuracy stayed stable - nice work. Nudging the target a little further.'
        : "You're holding a safe, accurate pace.",
      evidence: [`Accuracy ${pct(accuracy)} at or above your guardrail, with pace at or ahead of target.`],
      requiresCoachingNarrative: rampedDown,
    };
  }

  return hold(ctx, BottleneckType.UNKNOWN, "Keep going - we're gathering more evidence before adjusting your pace.", []);
}
