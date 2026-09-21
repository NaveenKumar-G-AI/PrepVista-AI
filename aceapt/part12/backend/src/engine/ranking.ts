import {
  DetectedProblem,
  InterventionCandidate,
  ScoredCandidate,
  StudentState,
  InterventionProfile,
  InterventionType
} from '../domain/types';
import { INTERVENTION_CATALOG } from '../domain/interventionCatalog';
import { RANKING_WEIGHTS, PROBLEM_INTERVENTION_FIT } from '../config';

export function scoreCandidates(
  candidates: InterventionCandidate[],
  problem: DetectedProblem,
  state: StudentState,
  profile: InterventionProfile | null
): ScoredCandidate[] {
  return candidates.map(c => scoreOne(c, problem, state, profile));
}

function scoreOne(
  candidate: InterventionCandidate,
  problem: DetectedProblem,
  state: StudentState,
  profile: InterventionProfile | null
): ScoredCandidate {
  const meta = INTERVENTION_CATALOG[candidate.type];
  const entry = profile?.entries.find(e => e.type === candidate.type) ?? null;
  const flags: ScoredCandidate['flags'] = [];

  // How directly this TYPE addresses THIS problem category, scaled by how
  // confident we are the problem is real. This is what stops every candidate
  // from a given problem scoring identically.
  const fit = PROBLEM_INTERVENTION_FIT[problem.category]?.[candidate.type] ?? 0.5;
  const problemFit = fit * problem.confidence;

  const studentFit = studentFitScore(candidate.type, state);
  const contextFit = contextFitScore(meta?.typicalDurationMin ?? 10, state);

  let historicalResponse = 0.5; // neutral prior
  if (!entry || entry.attempts < 2) {
    flags.push('COLD_START');
  } else {
    historicalResponse = responseLabelToScore(entry.responseLabel);
    if (entry.nonResponseFlag) flags.push('NON_RESPONSE_RISK');
    if (entry.saturationFlag) flags.push('SATURATION_RISK');
  }

  const expectedBenefit = (problemFit + studentFit) / 2;
  const timeCost = Math.min((meta?.typicalDurationMin ?? 10) / 30, 1);
  const loadRisk = meta?.cognitiveLoad === 'high' ? 0.7 : meta?.cognitiveLoad === 'medium' ? 0.35 : 0.1;

  const w = RANKING_WEIGHTS;
  let score =
    w.problemFit * problemFit +
    w.studentFit * studentFit +
    w.contextFit * contextFit +
    w.historicalResponse * historicalResponse +
    w.expectedBenefit * expectedBenefit -
    w.timeCost * timeCost -
    w.loadRisk * loadRisk;

  if (flags.includes('NON_RESPONSE_RISK')) score -= w.nonResponsePenalty;
  if (flags.includes('SATURATION_RISK')) score -= w.saturationPenalty;

  return {
    ...candidate,
    score: Math.round(score * 1000) / 1000,
    scoreBreakdown: { problemFit, studentFit, contextFit, historicalResponse, expectedBenefit, timeCost, loadRisk },
    flags
  };
}

function studentFitScore(type: InterventionType, state: StudentState): number {
  if (state.behaviorProfile === 'unavailable') return 0.5;
  const meta = INTERVENTION_CATALOG[type];
  const short = state.behaviorProfile.some(b => b.code === 'SHORT_SESSION_PREFERENCE');
  if (short && meta) return meta.typicalDurationMin <= 10 ? 0.85 : 0.5;
  return 0.65;
}

function contextFitScore(durationMin: number, state: StudentState): number {
  if (state.availableStudyMinutes === 'unavailable') return 0.6;
  if (state.availableStudyMinutes >= durationMin) return 0.9;
  return Math.max(0.1, state.availableStudyMinutes / durationMin);
}

function responseLabelToScore(label: string): number {
  switch (label) {
    case 'HIGH':
      return 0.95;
    case 'MEDIUM_HIGH':
      return 0.75;
    case 'MEDIUM':
      return 0.55;
    case 'LOW':
      return 0.25;
    default:
      return 0.5;
  }
}

export function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => b.score - a.score);
}
