import { ChallengeRepository, ExposureRepository, Challenge } from '../integration/adapters';

export interface ProblemSelectionCriteria {
  studentId: string;
  competencies: string[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  problemCount: number;
  excludeChallengeIds?: string[];
}

export interface SelectedProblem {
  challenge: Challenge;
  /** PHASE 55: explainability — always answerable "why was this problem selected". */
  reason: string;
}

/**
 * PHASE 4: prefer unseen or minimally exposed problems, ranked over an
 * exposure penalty (lower is better) rather than a hard include/exclude
 * cutoff, so the pool never runs dry for a narrow competency.
 */
export async function selectInterviewProblems(
  criteria: ProblemSelectionCriteria,
  challengeRepo: ChallengeRepository,
  exposureRepo: ExposureRepository,
): Promise<SelectedProblem[]> {
  const candidates = await challengeRepo.findCandidates({
    competencies: criteria.competencies,
    difficulty: criteria.difficulty,
    excludeChallengeIds: criteria.excludeChallengeIds ?? [],
  });
  if (candidates.length === 0) return [];

  const exposures = await exposureRepo.getExposure(criteria.studentId, candidates.map(c => c.id));
  const exposureByChallenge = new Map(exposures.map(e => [e.challengeId, e]));

  const scored = candidates.map(challenge => {
    const exposure = exposureByChallenge.get(challenge.id);
    let exposureScore = 0; // lower is better (less exposed)
    const matched = challenge.competencies.filter(c => criteria.competencies.includes(c));
    const reasonParts: string[] = [`matches competencies [${matched.join(', ')}]`];

    if (exposure?.usedInInterviewAt) { exposureScore += 100; reasonParts.push('already used in a prior interview'); }
    if (exposure?.solvedAt) { exposureScore += 40; reasonParts.push('previously solved in practice'); }
    else if (exposure?.attemptedAt) { exposureScore += 15; reasonParts.push('previously attempted, not solved'); }
    if (exposure?.usedInAssessmentAt) { exposureScore += 25; reasonParts.push('previously used in an assessment'); }
    if (exposureScore === 0) reasonParts.push('no prior exposure recorded — unseen problem');

    return { challenge, exposureScore, reason: reasonParts.join('; ') };
  });

  scored.sort((a, b) => a.exposureScore - b.exposureScore);
  return scored.slice(0, criteria.problemCount).map(s => ({ challenge: s.challenge, reason: s.reason }));
}
