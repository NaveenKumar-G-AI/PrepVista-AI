import { SkillAnalysis } from './types';

export type StripDim = 'Independent' | 'Difficulty' | 'Format' | 'Transfer' | 'Retention';
export type StripState = 'confirmed' | 'gap' | 'untested';

const STATE_RANK = ['UNSEEN', 'INTRODUCED', 'FAMILIAR', 'GUIDED', 'PRACTICING', 'INDEPENDENT', 'STABLE', 'RETAINED', 'TRANSFERRED', 'ROBUST_MASTERY'];

function rank(state: string): number {
  return STATE_RANK.indexOf(state);
}

/**
 * Each tick answers one question: has this dimension been *confirmed*
 * (enough evidence, and it held up), *gapped* (enough evidence, and it
 * didn't hold up), or is it simply *untested* (not enough evidence yet
 * either way)? This mirrors the engine's own three-way distinction — a
 * gap is never inferred from silence.
 */
export function deriveStrip(a: SkillAnalysis): Record<StripDim, StripState> {
  const r = rank(a.state);
  const flag = (f: string) => a.flags.includes(f as any);

  return {
    Independent: flag('INDEPENDENCE_GAP') ? 'gap' : r >= rank('INDEPENDENT') ? 'confirmed' : 'untested',
    Difficulty: flag('DIFFICULTY_GAP') ? 'gap' : a.difficultyCeiling === 'hard' ? 'confirmed' : 'untested',
    Format: flag('FORMAT_TRANSFER_GAP') || flag('CONTEXT_TRANSFER_GAP') ? 'gap' : r >= rank('STABLE') ? 'confirmed' : 'untested',
    Transfer: flag('TRANSFER_GAP') ? 'gap' : r >= rank('TRANSFERRED') ? 'confirmed' : 'untested',
    Retention: flag('RETENTION_GAP') ? 'gap' : r >= rank('RETAINED') ? 'confirmed' : 'untested',
  };
}

export const STRIP_DIMS: StripDim[] = ['Independent', 'Difficulty', 'Format', 'Transfer', 'Retention'];
