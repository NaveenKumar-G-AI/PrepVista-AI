import { predictedProbability } from './evidence';
import { ENGINE_CONSTANTS as C } from './constants';
import { Question } from '../domain/types';
import { AdaptiveDiagnosticState, AdaptiveMode, SkillEvidence } from '../domain/state';

/**
 * Fisher information for a 1PL/Rasch item: p*(1-p), maximized at p=0.5 -
 * i.e. when the question's difficulty is closest to the student's current
 * ability estimate. This is the mathematical backbone of "prefer questions
 * that can meaningfully reduce uncertainty" (spec section 17): a question
 * far below or above the student's level tells us almost nothing we don't
 * already expect.
 */
export function fisherInformation(ability: number, difficulty: number): number {
  const p = predictedProbability(ability, difficulty);
  return p * (1 - p);
}

export interface ScoreContext {
  mode: AdaptiveMode;
  targetSkillId: string;
  state: Pick<AdaptiveDiagnosticState, 'exposure' | 'patternExposure'>;
  skillEvidence: SkillEvidence | undefined;
}

export function scoreCandidate(question: Question, ctx: ScoreContext): number {
  if (question.isFlagged) return 0; // bad-question protection (spec section 33): hard zero, not a penalty

  const ability = ctx.skillEvidence?.estimate ?? 0;
  const evidenceCount = ctx.skillEvidence?.evidenceCount ?? 0;
  const baseInfo = fisherInformation(ability, question.difficultyRating);

  let modeMultiplier = 1;
  switch (ctx.mode) {
    case 'explore':
      // Zero-evidence skills are boosted hard regardless of Fisher info,
      // since there's no meaningful ability estimate to center on yet.
      modeMultiplier = evidenceCount === 0 ? 3 : 1;
      break;
    case 'investigate':
      modeMultiplier = (ctx.skillEvidence?.confidenceLabel ?? 'low') !== 'high' ? 1.8 : 0.6;
      break;
    case 'verify':
      modeMultiplier = ctx.skillEvidence?.isUnstable ? 2.5 : 0.5;
      break;
    case 'challenge': {
      const boundary = ctx.skillEvidence?.upperBoundaryDifficulty ?? ability;
      modeMultiplier = question.difficultyRating > boundary ? 2.2 : 0.3;
      break;
    }
    case 'transfer':
      modeMultiplier = question.isTransferVariant ? 2.5 : 0.4;
      break;
  }

  const exposurePenalty = 1 / (1 + (ctx.state.exposure[question.id] ?? 0) * 5);
  const patternPenaltySum = question.tags.reduce(
    (acc, tag) => acc + (ctx.state.patternExposure[tag] ?? 0) * C.PATTERN_EXPOSURE_PENALTY_PER_HIT,
    0
  );
  const patternPenalty = Math.max(0.1, 1 - patternPenaltySum);
  const noveltyBonus = representationNoveltyBonus(question, ctx.state);
  const qualityFactor = question.qualityScore;

  return baseInfo * modeMultiplier * exposurePenalty * patternPenalty * noveltyBonus * qualityFactor;
}

/**
 * Small bonus for questions carrying at least one tag (representation/
 * context) not yet seen this session - supports "different wording /
 * different representation" for verification (spec section 13) and
 * "unfamiliar structure" for transfer (spec section 15) without needing
 * bespoke logic in every mode.
 */
function representationNoveltyBonus(
  question: Question,
  state: Pick<AdaptiveDiagnosticState, 'patternExposure'>
): number {
  if (question.tags.length === 0) return 1;
  const hasUnseenTag = question.tags.some((t) => !(state.patternExposure[t] > 0));
  return hasUnseenTag ? C.REPRESENTATION_NOVELTY_BONUS : 1;
}
