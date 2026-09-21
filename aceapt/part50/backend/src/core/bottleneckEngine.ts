// Time Bottleneck Engine (spec sections 17-26, 58, 67-69, 133-134, 137).
// Every detector requires a minimum sample size and only fires on evidence
// that was actually measured - it never infers a stage duration that wasn't
// instrumented (spec 16, 101: "never fabricate stage-level timings").

import { BottleneckAssessment, BottleneckType, ScopeKey, SpeedAttemptRecord, SpeedBaseline } from '../types/domain';
import { SLOW_RATIO } from './speedAnalysis';

const STAGE_OVERAGE_RATIO = 1.3; // a stage counts as a bottleneck at 30%+ above the student's own stage baseline
const MIN_STAGE_SAMPLES = 3;

const RUSHING_WINDOW = 5;
const RUSHING_FAST_INACCURATE_RATIO = 0.4;

const HESITATION_WINDOW = 5;
const HESITATION_SLOW_RATIO = 0.6;

const KNOWLEDGE_GAP_ACCURACY_FLOOR = 0.6;

export interface StageBaselineMs {
  readingMs?: number;
  strategyMs?: number;
  calculationMs?: number;
  verificationMs?: number;
}

function avg(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function unknown(scope: ScopeKey, evidence: string, confidence: BottleneckAssessment['confidence'] = 'LOW'): BottleneckAssessment {
  return { type: BottleneckType.UNKNOWN, scope, evidence, confidence, metrics: {} };
}

/** Identifies which solving stage (if any) is disproportionately slow
 * relative to the student's OWN historical pace for that stage. Requires
 * Feature 47-style step instrumentation; degrades gracefully without it. */
export function detectStageBottleneck(
  recent: SpeedAttemptRecord[],
  scope: ScopeKey,
  stageBaseline: StageBaselineMs,
): BottleneckAssessment {
  const withStages = recent.filter(
    (a) => a.stage && (a.stage.readingMs || a.stage.strategyMs || a.stage.calculationMs || a.stage.verificationMs),
  );

  if (withStages.length < MIN_STAGE_SAMPLES) {
    return unknown(scope, 'Not enough stage-level timing instrumentation yet to isolate a stage.');
  }

  type StageKey = 'readingMs' | 'strategyMs' | 'calculationMs' | 'verificationMs';
  const stageToType: Record<StageKey, BottleneckType> = {
    readingMs: BottleneckType.READING,
    strategyMs: BottleneckType.STRATEGY,
    calculationMs: BottleneckType.CALCULATION,
    verificationMs: BottleneckType.VERIFICATION,
  };

  const overages = (Object.keys(stageToType) as StageKey[])
    .map((key) => {
      const values = withStages.map((a) => a.stage?.[key]).filter((v): v is number => v != null);
      if (values.length < MIN_STAGE_SAMPLES) return null;
      const observed = avg(values);
      const baseline = stageBaseline[key];
      if (!baseline || baseline <= 0) return null;
      const ratio = observed / baseline;
      if (ratio < STAGE_OVERAGE_RATIO) return null;
      return { key, type: stageToType[key], ratio, observed, baseline };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (overages.length === 0) {
    return unknown(scope, "No single stage stands out - timing looks evenly distributed relative to your own baseline.", 'MEDIUM');
  }

  overages.sort((a, b) => b.ratio - a.ratio);
  const top = overages[0];
  const humanStage = top.key.replace('Ms', '').replace(/^\w/, (c) => c.toUpperCase());

  return {
    type: top.type,
    scope,
    evidence: `${humanStage} time is running about ${Math.round((top.ratio - 1) * 100)}% above your usual pace for this stage, while your other stages look normal.`,
    confidence: withStages.length >= MIN_STAGE_SAMPLES * 3 ? 'HIGH' : withStages.length >= MIN_STAGE_SAMPLES * 2 ? 'MEDIUM' : 'LOW',
    metrics: { ratio: top.ratio, observedMs: top.observed, baselineMs: top.baseline },
  };
}

/** Fast + inaccurate, repeated (spec 25, 55, 131). */
export function detectRushing(
  recent: SpeedAttemptRecord[],
  baseline: SpeedBaseline | null,
  scope: ScopeKey,
): BottleneckAssessment | null {
  const window = recent.slice(-RUSHING_WINDOW);
  if (window.length < 3 || !baseline) return null;

  const fastInaccurate = window.filter((a) => a.responseTimeMs < baseline.averageMs * 0.8 && !a.correct);
  const rate = fastInaccurate.length / window.length;
  if (rate < RUSHING_FAST_INACCURATE_RATIO) return null;

  return {
    type: BottleneckType.RUSHING,
    scope,
    evidence: `${fastInaccurate.length} of your last ${window.length} responses were both unusually fast and incorrect.`,
    confidence: window.length >= RUSHING_WINDOW ? 'MEDIUM' : 'LOW',
    metrics: { rate },
  };
}

/** Slow + accurate, repeated - possible overchecking/decision friction
 * rather than a knowledge gap (spec 24, 56, 132). */
export function detectHesitation(
  recent: SpeedAttemptRecord[],
  baseline: SpeedBaseline | null,
  scope: ScopeKey,
): BottleneckAssessment | null {
  const window = recent.slice(-HESITATION_WINDOW);
  if (window.length < 3 || !baseline) return null;

  const slowAccurate = window.filter((a) => a.responseTimeMs > baseline.averageMs * SLOW_RATIO && a.correct);
  const rate = slowAccurate.length / window.length;
  if (rate < HESITATION_SLOW_RATIO) return null;

  const lowConfidenceDespiteCorrect = window.filter(
    (a) => a.correct && typeof a.confidenceRating === 'number' && a.confidenceRating <= 2,
  ).length;

  return {
    type: BottleneckType.HESITATION,
    scope,
    evidence:
      lowConfidenceDespiteCorrect > 0
        ? "You're consistently correct but slower than your baseline, and you reported low confidence even when right - a sign of overchecking rather than a knowledge gap."
        : "You're consistently correct but taking meaningfully longer than your own baseline here.",
    confidence: lowConfidenceDespiteCorrect > 0 ? 'MEDIUM' : 'LOW',
    metrics: { rate },
  };
}

/** Slow OR fast doesn't matter - accuracy is low even without unusual speed.
 * Speed training should not hide this (spec 42, 57, 108). */
export function detectKnowledgeGap(
  recent: SpeedAttemptRecord[],
  baseline: SpeedBaseline | null,
  guardrail: number,
  scope: ScopeKey,
): BottleneckAssessment | null {
  const window = recent.slice(-RUSHING_WINDOW);
  if (window.length < 3) return null;

  const accuracy = window.filter((a) => a.correct).length / window.length;
  const fastInaccurateRate = baseline
    ? window.filter((a) => a.responseTimeMs < baseline.averageMs * 0.8 && !a.correct).length / window.length
    : 0;

  if (accuracy >= Math.min(guardrail, KNOWLEDGE_GAP_ACCURACY_FLOOR)) return null;
  if (fastInaccurateRate >= RUSHING_FAST_INACCURATE_RATIO) return null; // that's rushing, not a knowledge gap

  return {
    type: BottleneckType.KNOWLEDGE_GAP,
    scope,
    evidence: `Accuracy is ${Math.round(accuracy * 100)}% even without unusually fast responses - this looks like a concept or strategy gap rather than a pure speed issue.`,
    confidence: 'MEDIUM',
    metrics: { accuracy },
  };
}

/** Only fires when the client actually sent retry/idle instrumentation
 * (spec 26: "only use signals actually measurable"). */
export function detectTimeWasting(recent: SpeedAttemptRecord[], scope: ScopeKey): BottleneckAssessment | null {
  const withSignal = recent.filter((a) => (a.retryCount != null && a.retryCount > 0) || (a.idleMs != null && a.idleMs > 0));
  if (withSignal.length < 3) return null;

  const heavyRetry = withSignal.filter((a) => (a.retryCount ?? 0) >= 2).length;
  const heavyIdle = withSignal.filter((a) => (a.idleMs ?? 0) > 15000).length;
  if (heavyRetry + heavyIdle < 3) return null;

  return {
    type: BottleneckType.TIME_WASTING,
    scope,
    evidence: 'Recent attempts show repeated retries or long inactive stretches rather than steady solving time.',
    confidence: 'LOW',
    metrics: { heavyRetry, heavyIdle },
  };
}

export function assessBottlenecks(params: {
  recent: SpeedAttemptRecord[];
  baseline: SpeedBaseline | null;
  guardrail: number;
  scope: ScopeKey;
  stageBaseline?: StageBaselineMs;
}): BottleneckAssessment[] {
  const results: BottleneckAssessment[] = [];

  const knowledgeGap = detectKnowledgeGap(params.recent, params.baseline, params.guardrail, params.scope);
  if (knowledgeGap) results.push(knowledgeGap);

  const rushing = detectRushing(params.recent, params.baseline, params.scope);
  if (rushing) results.push(rushing);

  const hesitation = detectHesitation(params.recent, params.baseline, params.scope);
  if (hesitation) results.push(hesitation);

  const timeWasting = detectTimeWasting(params.recent, params.scope);
  if (timeWasting) results.push(timeWasting);

  const stage = detectStageBottleneck(params.recent, params.scope, params.stageBaseline ?? {});
  if (stage.type !== BottleneckType.UNKNOWN) results.push(stage);

  if (results.length === 0) {
    results.push(unknown(params.scope, 'Not enough evidence yet to identify a specific bottleneck.'));
  }
  return results;
}

const CONFIDENCE_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function topBottleneck(assessments: BottleneckAssessment[]): BottleneckAssessment {
  return [...assessments].sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])[0];
}
