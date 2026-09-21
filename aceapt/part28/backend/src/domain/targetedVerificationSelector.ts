// Section 7 — uncertainty-driven verification: "test what is uncertain, not
// what is already known." Section 20 — minimum sufficient evidence: stop
// asking for more testing once existing evidence already clears the bar.
// Section 21 — lightweight fatigue awareness.

import type {
  TargetedVerificationPlan, VerificationEvidence, VerificationRequirement, NoveltyLevel, SimulationMode,
} from './types.js';
import type { VerificationEngineConfig } from './config.js';
import type { ForecastSignal } from './ports.js';
import { evaluateVerification } from './verificationEngine.js';

export interface SelectPlanInput {
  forecast: ForecastSignal;
  evidence: VerificationEvidence[];
  requirement: VerificationRequirement;
  config: VerificationEngineConfig;
  recentSessionCount7d: number;
  minutesSinceLastSession: number | null;
}

const DURATION_BY_MODE: Record<SimulationMode, number> = {
  QUICK_VERIFICATION: 12,
  STANDARD_VERIFICATION: 25,
  FULL_SIMULATION: 45,
  FINAL_READINESS_CHECK: 60,
};

const QUESTION_COUNT_BY_MODE: Record<SimulationMode, number> = {
  QUICK_VERIFICATION: 8,
  STANDARD_VERIFICATION: 18,
  FULL_SIMULATION: 35,
  FINAL_READINESS_CHECK: 45,
};

const NOVELTY_ORDER: NoveltyLevel[] = ['FAMILIAR', 'RELATED', 'NOVEL', 'HIGHLY_NOVEL'];
function nextNoveltyTarget(current: NoveltyLevel): NoveltyLevel {
  const idx = Math.min(NOVELTY_ORDER.indexOf(current) + 1, NOVELTY_ORDER.length - 1);
  return NOVELTY_ORDER[idx] ?? 'NOVEL';
}

export function selectVerificationPlan(input: SelectPlanInput): TargetedVerificationPlan {
  const { forecast, requirement, config } = input;

  const evalResult = evaluateVerification({ evidence: input.evidence, requirement, config });

  const evidenceSufficient = !evalResult.insufficientEvidence
    && evalResult.confidence === 'HIGH'
    && (evalResult.status === 'VERIFIED' || evalResult.status === 'STRONGLY_VERIFIED');

  const failingFactors = [...evalResult.factors]
    .filter((f) => !f.meetsRequirement)
    .sort((a, b) => (a.score - a.threshold) - (b.score - b.threshold));
  const failingFactor = failingFactors[0];

  const condition: TargetedVerificationPlan['condition'] = forecast.mainUncertainty?.condition
    ?? (failingFactor?.name === 'Timed Performance' ? 'TIME_PRESSURE'
      : failingFactor?.name === 'Novel Performance' ? 'NOVELTY'
        : failingFactor?.name === 'Consistency' ? 'CONSISTENCY'
          : 'STANDARD');

  const capability = forecast.mainUncertainty?.capability ?? requirement.capability;

  const isFatigued = input.recentSessionCount7d >= 4
    || (input.minutesSinceLastSession !== null && input.minutesSinceLastSession < 20);

  // Section 19's four modes each answer a different question: is there any
  // baseline evidence at all (STANDARD), is exactly one narrow gap left to
  // close (QUICK), is uncertainty spread across several factors at once
  // (FULL), or is this the last high-confidence check before VERIFIED
  // (FINAL)? Fatigue can still step any of these down below.
  let mode: SimulationMode;
  if (evalResult.insufficientEvidence) {
    mode = 'STANDARD_VERIFICATION';
  } else if (evalResult.status === 'CONDITIONALLY_VERIFIED' && evalResult.confidence !== 'LOW') {
    mode = 'FINAL_READINESS_CHECK';
  } else if (failingFactors.length >= 2) {
    mode = 'FULL_SIMULATION';
  } else if (failingFactors.length === 1) {
    mode = 'QUICK_VERIFICATION';
  } else {
    mode = 'STANDARD_VERIFICATION';
  }
  if (isFatigued && mode !== 'QUICK_VERIFICATION') {
    mode = 'QUICK_VERIFICATION';
  }

  const noveltyTarget = condition === 'NOVELTY' ? nextNoveltyTarget(requirement.minNovelty) : requirement.minNovelty;

  const strongestFactorName = [...evalResult.factors].sort((a, b) => b.score - a.score)[0]?.name.toLowerCase() ?? 'practice';
  const reason = evidenceSufficient
    ? `Your existing evidence already meets ${requirement.capability} at high confidence — further testing right now is unlikely to add meaningful evidence.`
    : evalResult.insufficientEvidence
      ? `There isn't enough recorded evidence yet for ${capability}. This session builds a broad first evidence base.`
      : `Your strongest evidence is in ${strongestFactorName}, but ${failingFactor?.name.toLowerCase() ?? 'target capability'} still falls short of the bar — this session is built to test exactly that.`;

  return {
    targetId: forecast.targetId,
    capability,
    condition,
    novelty: noveltyTarget,
    durationMinutes: DURATION_BY_MODE[mode],
    reason,
    evidenceSufficient,
    simulationProfile: {
      mode,
      questionCount: QUESTION_COUNT_BY_MODE[mode],
      difficultyDistribution: condition === 'STANDARD'
        ? { EASY: 0.2, MEDIUM: 0.4, HARD: 0.3, TARGET: 0.1 }
        : { MEDIUM: 0.25, HARD: 0.4, TARGET: 0.35 },
      topicDistribution: { [capability]: 1 },
      timeLimitMs: DURATION_BY_MODE[mode] * 60 * 1000,
      noveltyTarget,
      targetCapability: capability,
      navigationBehavior: mode === 'FINAL_READINESS_CHECK' ? 'LINEAR' : 'FREE',
      scoringRules: {
        negativeMarking: mode === 'FULL_SIMULATION' || mode === 'FINAL_READINESS_CHECK',
        partialCredit: false,
      },
    },
  };
}
