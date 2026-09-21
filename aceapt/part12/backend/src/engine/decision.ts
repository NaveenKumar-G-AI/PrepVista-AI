import { randomUUID } from 'crypto';
import { DetectedProblem, InterventionDecision, StudentState, InterventionProfile } from '../domain/types';
import { generateCandidates } from './candidateGeneration';
import { scoreCandidates, rankCandidates } from './ranking';

export function decideIntervention(
  problem: DetectedProblem,
  state: StudentState,
  profile: InterventionProfile | null
): InterventionDecision | null {
  const candidates = generateCandidates(problem);
  if (candidates.length === 0) return null;

  const scored = scoreCandidates(candidates, problem, state, profile);
  const ranked = rankCandidates(scored);

  // Prefer the top candidate that isn't flagged as a non-response risk; if
  // every option is flagged we still have to pick something, but the flag
  // stays visible on the decision so it's never hidden.
  const selected = ranked.find(c => !c.flags.includes('NON_RESPONSE_RISK')) ?? ranked[0];

  return {
    id: randomUUID(),
    studentId: state.studentId,
    problem,
    candidates: ranked,
    selected,
    confidence: problem.confidence,
    reason: problem.reason,
    createdAt: new Date().toISOString()
  };
}

/**
 * Runs decision-making for every detected problem and returns decisions
 * sorted by the selected candidate's score, best first. The caller (the API
 * layer) decides how many of these to act on — the prototype surfaces the
 * top one as "your next intervention" and keeps the rest as alternatives.
 */
export function decideAllInterventions(
  problems: DetectedProblem[],
  state: StudentState,
  profile: InterventionProfile | null
): InterventionDecision[] {
  const decisions = problems
    .map(p => decideIntervention(p, state, profile))
    .filter((d): d is InterventionDecision => d !== null);
  return decisions.sort((a, b) => b.selected.score - a.selected.score);
}
