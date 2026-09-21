import { AdaptiveDiagnosticState, AdaptiveMode, SkillEvidence } from '../domain/state';
import { EvidenceConfidence, Skill } from '../domain/types';
import { ENGINE_CONSTANTS as C } from './constants';

export interface ModeDecision {
  mode: AdaptiveMode;
  targetSkillId: string;
  domainScope: string[];
  skillScope: string[];
  reason: string;
}

/**
 * Priority order and why:
 *
 *  1. Coverage guardrail - a hard constraint. If the question budget is
 *     about to run out before required domains hit their minimum, nothing
 *     else matters more (spec section 22).
 *  2. Verify - contradictory evidence gets resolved before we draw ANY
 *     further conclusion about that skill (spec sections 13, 34, 93).
 *  3. Explore - a skill with zero evidence is investigated, never assumed
 *     weak (spec section 11).
 *  4. Challenge - only once a skill has a confirmed, high-confidence,
 *     sustained correct streak (and fluency isn't still in question - see
 *     needsSpeedCheck) do we push the upper boundary (spec section 14).
 *  5. Transfer - a skill that's strong and confident on familiar items, but
 *     untested (or only ambiguously tested) on transfer items (spec
 *     sections 15, 79).
 *  6. Investigate - the fallback: whichever in-scope skill is furthest from
 *     the target evidence confidence, or has an open speed/rush/calibration
 *     flag, gets probed next (spec section 12).
 */
export function selectMode(state: AdaptiveDiagnosticState, allScopedSkills: Skill[]): ModeDecision {
  const scopedSkills = allScopedSkills.filter((s) => state.config.requiredDomains.includes(s.domain));

  const forcedDomain = coverageForcedDomain(state);
  if (forcedDomain) {
    const inDomain = scopedSkills.filter((s) => s.domain === forcedDomain);
    const target = inDomain.find((s) => (state.skillEvidence[s.id]?.evidenceCount ?? 0) === 0) ?? inDomain[0];
    if (target) {
      const isUnexplored = (state.skillEvidence[target.id]?.evidenceCount ?? 0) === 0;
      return {
        mode: isUnexplored ? 'explore' : 'investigate',
        targetSkillId: target.id,
        domainScope: [forcedDomain],
        skillScope: [target.id],
        reason: `Coverage guardrail: ${forcedDomain} has not met its minimum question count and the remaining question budget is limited.`,
      };
    }
  }

  const unstable = scopedSkills.find((s) => state.skillEvidence[s.id]?.isUnstable);
  if (unstable) {
    return {
      mode: 'verify',
      targetSkillId: unstable.id,
      domainScope: [unstable.domain],
      skillScope: [unstable.id],
      reason: `${unstable.label} has produced conflicting evidence; resolving before drawing a conclusion.`,
    };
  }

  const unexplored = scopedSkills.find((s) => (state.skillEvidence[s.id]?.evidenceCount ?? 0) === 0);
  if (unexplored) {
    return {
      mode: 'explore',
      targetSkillId: unexplored.id,
      domainScope: [unexplored.domain],
      skillScope: [unexplored.id],
      reason: `No evidence yet for ${unexplored.label}.`,
    };
  }

  const challengeTarget = scopedSkills.find((s) => isChallengeReady(state.skillEvidence[s.id]));
  if (challengeTarget) {
    return {
      mode: 'challenge',
      targetSkillId: challengeTarget.id,
      domainScope: [challengeTarget.domain],
      skillScope: [challengeTarget.id],
      reason: `${challengeTarget.label} shows a sustained correct streak; probing the upper capability boundary.`,
    };
  }

  const transferTarget = scopedSkills.find((s) => isTransferReady(state.skillEvidence[s.id]));
  if (transferTarget) {
    return {
      mode: 'transfer',
      targetSkillId: transferTarget.id,
      domainScope: [transferTarget.domain],
      skillScope: [transferTarget.id],
      reason: `${transferTarget.label} is strong on familiar patterns; testing whether that generalizes to unfamiliar framing.`,
    };
  }

  const investigateTarget = pickInvestigateTarget(scopedSkills, state);
  if (investigateTarget) {
    return {
      mode: 'investigate',
      targetSkillId: investigateTarget.id,
      domainScope: [investigateTarget.domain],
      skillScope: [investigateTarget.id],
      reason: `${investigateTarget.label} has not yet reached the target evidence confidence; probing where capability breaks down.`,
    };
  }

  const fallback = scopedSkills[0];
  return {
    mode: 'investigate',
    targetSkillId: fallback?.id ?? '',
    domainScope: fallback ? [fallback.domain] : [],
    skillScope: fallback ? [fallback.id] : [],
    reason: 'No higher-priority signal found; continuing general investigation.',
  };
}

function coverageForcedDomain(state: AdaptiveDiagnosticState): string | null {
  const remainingBudget = state.config.maxQuestions - state.questionsAsked;
  const unmet = Object.values(state.coverage).filter((c) => !c.satisfied);
  if (unmet.length === 0) return null;
  const unmetNeed = unmet.reduce((sum, c) => sum + Math.max(0, c.minimumRequired - c.questionsAsked), 0);
  return remainingBudget <= unmetNeed + 1 ? unmet[0].domain : null;
}

function isChallengeReady(e: SkillEvidence | undefined): boolean {
  if (!e) return false;
  if (e.needsSpeedCheck) return false; // fluency unconfirmed - investigate that first (spec section 27)
  if (e.confidenceLabel !== 'high') return false;
  return e.recentCorrectStreakAtOrAboveBoundary >= C.CHALLENGE_STREAK_REQUIRED;
}

function isTransferReady(e: SkillEvidence | undefined): boolean {
  if (!e) return false;
  if (e.needsSpeedCheck) return false; // confirm fluency before testing generalization (spec section 27)
  const familiarStrong = e.estimate >= C.TRANSFER_TRIGGER_MIN_ESTIMATE && e.uncertainty <= C.TRANSFER_TRIGGER_MAX_UNCERTAINTY;
  if (!familiarStrong) return false;
  if (e.transferEvidenceCount === 0) return true; // never tested transfer
  // A gap was flagged but we don't yet have enough transfer evidence to
  // confirm or refute it (spec section 58: don't declare a confirmed
  // learning failure from insufficient evidence).
  return e.potentialTransferGap && e.transferEvidenceCount < C.TRANSFER_CONFIRM_MIN_EVIDENCE;
}

function pickInvestigateTarget(skills: Skill[], state: AdaptiveDiagnosticState): Skill | undefined {
  const targetRank = confidenceRank(state.config.targetEvidenceConfidence);
  const candidates = skills.filter((s) => {
    const e = state.skillEvidence[s.id];
    if (!e) return false;
    if (e.needsSpeedCheck || e.needsRushInvestigation || e.calibrationFlag !== 'none') return true;
    return confidenceRank(e.confidenceLabel) < targetRank;
  });
  if (candidates.length === 0) return undefined;

  // Flagged (speed/rush/calibration) skills are usually resolved in a single
  // extra item, so they take priority over a general weak-skill sweep.
  const flagged = candidates.filter((s) => {
    const e = state.skillEvidence[s.id];
    return e.needsSpeedCheck || e.needsRushInvestigation || e.calibrationFlag !== 'none';
  });
  const pool = flagged.length > 0 ? flagged : candidates;
  return pool.sort((a, b) => state.skillEvidence[a.id].estimate - state.skillEvidence[b.id].estimate)[0];
}

function confidenceRank(c: EvidenceConfidence): number {
  return { low: 0, moderate: 1, high: 2 }[c];
}
