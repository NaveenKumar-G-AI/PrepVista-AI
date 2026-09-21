// Sections 14-17 — the verification state model, the explainable rules
// engine, and the confidence/readiness split. Deterministic and
// reproducible by design (Section 44): AI is never involved in deciding
// status, score, or confidence here — only in restating the result in
// friendlier language afterward (see src/adapters/groqExplanationAdapter.ts).

import type {
  VerificationEvidence, VerificationRequirement, VerificationFactor, VerificationStatus,
  ConfidenceLevel, EvidenceSummary,
} from './types.js';
import type { VerificationEngineConfig } from './config.js';
import { clamp01, noveltyAtLeast, stddev, weightedMean } from './util.js';
import { overallQuality, summarizeEvidence } from './evidenceAggregation.js';

export interface SessionSignals {
  lateTestDegradation: boolean;
  recoveryConcern: boolean;
  abandoned: boolean;
}

export interface EvaluateVerificationInput {
  evidence: VerificationEvidence[];
  requirement: VerificationRequirement;
  config: VerificationEngineConfig;
  sessionSignals?: SessionSignals;
}

export interface EvaluateVerificationOutput {
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  factors: VerificationFactor[];
  evidenceSummary: EvidenceSummary;
  insufficientEvidence: boolean;
}

function relevantTo(evidence: VerificationEvidence[], capability: string): VerificationEvidence[] {
  return evidence.filter((e) => e.capability === capability && e.isValid);
}

function qualityWeightedPerformance(evidence: VerificationEvidence[]): number {
  return weightedMean(evidence.map((e) => ({ value: e.performance, weight: overallQuality(e.quality) })));
}

export function evaluateVerification(input: EvaluateVerificationInput): EvaluateVerificationOutput {
  const { requirement, config } = input;
  const evidence = relevantTo(input.evidence, requirement.capability);
  const evidenceSummary = summarizeEvidence(evidence);
  const insufficientEvidence = evidence.length < config.minEvidenceForAnyStatus;

  const targetCapabilityScore = qualityWeightedPerformance(evidence);

  const novelEvidence = evidence.filter((e) => noveltyAtLeast(e.novelty, requirement.minNovelty));
  const novelPerformanceScore = novelEvidence.length ? qualityWeightedPerformance(novelEvidence) : 0;

  const timedEvidence = evidence.filter((e) => e.quality.timePressure > 0.5 && e.timeTakenMs != null);
  const timedPerformanceScore = timedEvidence.length ? qualityWeightedPerformance(timedEvidence) : 0;

  const recentPerformances = [...evidence]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((e) => e.performance);
  const consistencyScore = recentPerformances.length >= 2
    ? clamp01(1 - stddev(recentPerformances) / config.consistencyVarianceCeiling)
    : recentPerformances.length === 1 ? 0.5 : 0;

  let criticalRiskScore = 0.85;
  if (input.sessionSignals) {
    if (input.sessionSignals.lateTestDegradation) criticalRiskScore -= 0.35;
    if (input.sessionSignals.recoveryConcern) criticalRiskScore -= 0.3;
    if (input.sessionSignals.abandoned) criticalRiskScore -= 0.4;
    criticalRiskScore = clamp01(criticalRiskScore);
  }

  const factors: VerificationFactor[] = [
    {
      name: 'Target Capability',
      score: targetCapabilityScore,
      threshold: requirement.minPerformance,
      weight: 0.3,
      meetsRequirement: targetCapabilityScore >= requirement.minPerformance,
      explanation: evidence.length
        ? `Quality-weighted performance on ${requirement.capability} is ${(targetCapabilityScore * 100).toFixed(0)}%, against a ${(requirement.minPerformance * 100).toFixed(0)}% requirement.`
        : `No evidence recorded yet for ${requirement.capability}.`,
    },
    {
      name: 'Novel Performance',
      score: novelPerformanceScore,
      threshold: requirement.minPerformance,
      weight: 0.2,
      meetsRequirement: novelEvidence.length > 0 && novelPerformanceScore >= requirement.minPerformance,
      explanation: novelEvidence.length
        ? `Performance on ${requirement.minNovelty.toLowerCase()}-or-higher novelty items is ${(novelPerformanceScore * 100).toFixed(0)}%.`
        : `No ${requirement.minNovelty.toLowerCase()}-or-higher novelty evidence recorded yet.`,
    },
    {
      name: 'Timed Performance',
      score: timedPerformanceScore,
      threshold: requirement.minTimedPerformance,
      weight: 0.2,
      meetsRequirement: timedEvidence.length > 0 && timedPerformanceScore >= requirement.minTimedPerformance,
      explanation: timedEvidence.length
        ? `Performance under measured time pressure is ${(timedPerformanceScore * 100).toFixed(0)}%.`
        : 'No evidence collected yet under measured time pressure.',
    },
    {
      name: 'Consistency',
      score: consistencyScore,
      threshold: requirement.minConsistency,
      weight: 0.2,
      meetsRequirement: consistencyScore >= requirement.minConsistency,
      explanation: recentPerformances.length >= 2
        ? `Recent attempts vary by ${(stddev(recentPerformances) * 100).toFixed(0)} points, giving a consistency score of ${(consistencyScore * 100).toFixed(0)}%.`
        : 'Not enough recent attempts to assess consistency yet.',
    },
    {
      name: 'Critical Risk',
      score: criticalRiskScore,
      threshold: 0.7,
      weight: 0.1,
      meetsRequirement: criticalRiskScore >= 0.7,
      explanation: input.sessionSignals
        ? (input.sessionSignals.lateTestDegradation
          ? 'Recent simulation performance dropped in the final stretch.'
          : input.sessionSignals.recoveryConcern
            ? 'Performance did not recover well after a difficult question in the most recent simulation.'
            : 'No elevated risk signals from the most recent simulation.')
        : 'No simulation completed yet to assess risk from.',
    },
  ];

  const composite = weightedMean(factors.map((f) => ({ value: f.score, weight: f.weight })));
  const allFactorsMet = factors.every((f) => f.meetsRequirement);
  const { statusThresholds } = config;

  let status: VerificationStatus;
  if (insufficientEvidence) {
    status = 'NOT_VERIFIED';
  } else if (composite >= statusThresholds.strong && allFactorsMet) {
    status = 'STRONGLY_VERIFIED';
  } else if (composite >= statusThresholds.verified && allFactorsMet) {
    status = 'VERIFIED';
  } else if (composite >= statusThresholds.conditional) {
    status = 'CONDITIONALLY_VERIFIED';
  } else if (composite >= statusThresholds.emerging) {
    status = 'EMERGING_EVIDENCE';
  } else {
    status = 'NOT_VERIFIED';
  }

  const effectiveEvidenceCount = evidence.reduce((s, e) => s + overallQuality(e.quality), 0);
  const confidence: ConfidenceLevel = effectiveEvidenceCount >= config.confidenceThresholds.high
    ? 'HIGH'
    : effectiveEvidenceCount >= config.confidenceThresholds.medium
      ? 'MEDIUM'
      : 'LOW';

  return { status, confidence, factors, evidenceSummary, insufficientEvidence };
}
