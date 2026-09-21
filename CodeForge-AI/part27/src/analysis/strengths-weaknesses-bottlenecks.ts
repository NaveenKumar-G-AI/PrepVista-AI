import type { SkillState } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Strength / Weakness / Bottleneck detection (sections 19-21). These are
 * pure views computed from a student's current SkillState set — nothing
 * here is persisted, so there is nothing to keep in sync when new
 * evidence changes the underlying states (section 36: "generated from
 * actual evidence", every time it's asked for).
 */

const PROFICIENT_PLUS = new Set(['PROFICIENT', 'MASTERED']);
const PERSISTENT_WEAKNESS_STATES = new Set(['DEVELOPING', 'AT_RISK', 'REGRESSING']);

/** Repeated, transfer-tested, reasonably-corroborated strength — not "solved one hard problem" (section 19). */
export function detectStrengths(skillStates: SkillState[]): SkillState[] {
  return skillStates.filter(
    (s) => PROFICIENT_PLUS.has(s.state) && s.confidence.level !== 'LOW' && s.transfer !== 'WEAK',
  );
}

/** Requires enough evidence to be a pattern, not one isolated failure (section 20). */
export function detectWeaknesses(skillStates: SkillState[]): SkillState[] {
  return skillStates.filter(
    (s) => PERSISTENT_WEAKNESS_STATES.has(s.state) && s.evidenceCount >= growthRules.confidence.minEvidenceForModerate,
  );
}

export interface BottleneckResult {
  skillId: string;
  gapBelowPeers: number;
}

/**
 * A single skill dragging down an otherwise-strong profile (section 21).
 * Only fires when there's a real peer group of proficient-or-better
 * skills to compare against — a student with one strong skill and nothing
 * else doesn't have a "bottleneck", they have a profile with insufficient
 * evidence everywhere else.
 */
export function detectBottleneck(skillStates: SkillState[]): BottleneckResult | null {
  const { minPeerCategoriesProficient, minGapBelowPeersToFlag } = growthRules.bottleneck;

  const peers = skillStates.filter((s) => PROFICIENT_PLUS.has(s.state) && s.performanceScore !== null);
  if (peers.length < minPeerCategoriesProficient) return null;

  const peerAvg = peers.reduce((sum, s) => sum + (s.performanceScore ?? 0), 0) / peers.length;

  let worst: SkillState | null = null;
  let worstGap = 0;
  for (const s of skillStates) {
    if (PROFICIENT_PLUS.has(s.state) || s.performanceScore === null) continue;
    const gap = peerAvg - s.performanceScore;
    if (gap > worstGap) {
      worst = s;
      worstGap = gap;
    }
  }

  if (!worst || worstGap < minGapBelowPeersToFlag) return null;
  return { skillId: worst.skillId, gapBelowPeers: worstGap };
}
