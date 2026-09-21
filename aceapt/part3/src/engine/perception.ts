import { capabilityRank } from './capability.js';
import type { Skill, StudentSkillState } from '../domain/types.js';

export interface PerceptionInsight {
  category: 'hidden_strength' | 'overconfidence_flag' | 'calibrated';
  skillId: string | null;
  message: string;
}

/**
 * Feature 1 gives a domain-level self-rating; Feature 2/3 give skill-level
 * evidence. This ties the comparison to the single skill that actually
 * explains the mismatch, rather than a blurry domain average — "hidden
 * strength" is driven by the standout skill, "overconfidence" by the
 * weakest evidenced one. Never phrased as a judgment of the student.
 */
export function domainPerceptionInsight(
  selfRating: 'weak' | 'developing' | 'strong',
  skillStates: Array<{ skill: Skill; state: StudentSkillState }>,
): PerceptionInsight | null {
  const withEvidence = skillStates.filter((s) => s.state.evidenceStrength !== 'NONE');
  if (withEvidence.length === 0) return null;

  const ranked = withEvidence.map((s) => ({ ...s, rank: capabilityRank(s.state.capability) }));
  const maxEntry = ranked.reduce((a, b) => (b.rank > a.rank ? b : a));
  const minEntry = ranked.reduce((a, b) => (b.rank < a.rank ? b : a));

  if (selfRating === 'weak' && maxEntry.rank >= 5) {
    return {
      category: 'hidden_strength',
      skillId: maxEntry.skill.id,
      message: `You rated this as an area of concern, but ${maxEntry.skill.name} shows stronger performance than expected.`,
    };
  }

  if (selfRating === 'strong' && minEntry.rank <= 3) {
    return {
      category: 'overconfidence_flag',
      skillId: minEntry.skill.id,
      message: `Your fundamentals look solid overall — ${minEntry.skill.name} is still developing relative to how confident you felt.`,
    };
  }

  return { category: 'calibrated', skillId: null, message: 'Self-rating lines up with observed evidence so far.' };
}
