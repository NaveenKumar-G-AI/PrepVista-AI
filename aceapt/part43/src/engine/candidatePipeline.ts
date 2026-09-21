import { QuestionRepository, RandomSource } from '../domain/ports';
import { AdaptiveDiagnosticState } from '../domain/state';
import { Question } from '../domain/types';
import { scoreCandidate } from './informationValue';
import { ModeDecision } from './modeSelector';

export interface RankedCandidate {
  question: Question;
  score: number;
}

/**
 * Implements the section-74 pipeline:
 *   candidate pool -> remove invalid/flagged -> prefer unexposed ->
 *   score (skill relevance + difficulty relevance + information value +
 *   exposure/fatigue cost, via scoreCandidate) -> rank.
 *
 * Note: candidates are queried by the mode decision's specific skillScope
 * (always exactly one target skill - see modeSelector.ts), which is what
 * makes the "unknown mixed-concept skill wins over an easy question on a
 * mastered skill" example (spec section 75) fall out of correct skill
 * modeling rather than needing bespoke cross-skill comparison logic.
 */
export async function buildRankedCandidates(
  questionRepo: QuestionRepository,
  state: AdaptiveDiagnosticState,
  decision: ModeDecision,
  rng: RandomSource
): Promise<RankedCandidate[]> {
  const pool = await questionRepo.findCandidates({
    domains: decision.domainScope,
    skillIds: decision.skillScope,
    onlyValidated: true,
    excludeFlagged: true,
  });

  const notYetAsked = pool.filter((q) => !state.askedQuestionIds.includes(q.id));
  // Fall back to the full (still exposure-penalized) pool only if every
  // candidate for this skill has already been asked.
  const usablePool = notYetAsked.length > 0 ? notYetAsked : pool;

  const scored = usablePool.map((question) => ({
    question,
    score: scoreCandidate(question, {
      mode: decision.mode,
      targetSkillId: decision.targetSkillId,
      state,
      skillEvidence: state.skillEvidence[question.skillId],
    }),
  }));

  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) > 1e-9) return diff;
    return rng.next() - 0.5; // controlled, seedable tie-break (spec section 90)
  });

  return scored;
}
