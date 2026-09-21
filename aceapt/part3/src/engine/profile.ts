import { SKILLS, RELATIONSHIPS } from '../domain/taxonomy.js';
import { genId } from '../domain/id.js';
import {
  capCapability,
  computeEvidenceStrength,
  rawAccuracySignal,
  signalToCapability,
  subCapabilityRead,
} from './capability.js';
import { adjustEvidenceStrengthForContradiction, computeFreshness, detectContradiction } from './trust.js';
import { detectGaps, detectSpeedIssue } from './gaps.js';
import { computePriority, countDownstream } from './priority.js';
import { domainPerceptionInsight } from './perception.js';
import type { Repository } from '../store/repository.js';
import type { CapabilityState, Domain, StudentSkillProfile, StudentSkillState } from '../domain/types.js';

const STRONG_STATES: CapabilityState[] = ['STRONG', 'ADVANCED', 'VERIFIED', 'MASTERED'];
const DEVELOPING_STATES: CapabilityState[] = ['EMERGING', 'DEVELOPING', 'FUNCTIONAL'];
const LIMITED_STATES: CapabilityState[] = ['NOT_ASSESSED', 'LIMITED_EVIDENCE'];

export function computeStudentSkillProfile(
  studentId: string,
  repo: Repository,
  opts: { targetDomains: Domain[]; daysToTarget: number | null },
): StudentSkillProfile {
  const now = new Date().toISOString();
  const results: Array<{ skill: (typeof SKILLS)[number]; state: StudentSkillState }> = [];
  const maxDownstream = Math.max(1, ...SKILLS.map((s) => countDownstream(s.id, RELATIONSHIPS)));

  for (const skill of SKILLS) {
    const evidence = repo.getEvidenceForSkill(studentId, skill.id);

    const rawTier = computeEvidenceStrength(evidence);
    const isContradictory = detectContradiction(evidence);
    const evidenceStrength = adjustEvidenceStrengthForContradiction(rawTier, isContradictory);

    const rawScore = rawAccuracySignal(evidence);
    const rawCapability: CapabilityState = evidence.length === 0 ? 'NOT_ASSESSED' : signalToCapability(rawScore);
    const capability = capCapability(rawCapability, evidenceStrength);

    const foundation = subCapabilityRead(evidence, 'foundation');
    const application = subCapabilityRead(evidence, 'application');
    const transfer = subCapabilityRead(evidence, 'transfer');
    const freshness = computeFreshness(evidence);

    const priorState = repo.getState(studentId, skill.id);
    const wasStrongBefore = priorState ? STRONG_STATES.includes(priorState.capability) : false;
    const speedIssue = detectSpeedIssue(evidence);

    const gapTypes = detectGaps({
      evidenceCount: evidence.length,
      foundation,
      application,
      transfer,
      speedIssue,
      isContradictory,
      freshness,
      wasStrongBefore,
    });

    const downstreamCount = countDownstream(skill.id, RELATIONSHIPS);
    const priorityBreakdown = computePriority({
      skill,
      state: { capability, evidenceStrength, gapTypes },
      downstreamCount,
      maxDownstreamCount: maxDownstream,
      targetDomains: opts.targetDomains,
      daysToTarget: opts.daysToTarget,
    });

    const hasRealGap = gapTypes.length > 0 && !gapTypes.includes('INSUFFICIENT_EVIDENCE');

    const newState: StudentSkillState = {
      studentId,
      skillId: skill.id,
      capability,
      evidenceStrength,
      foundation,
      application,
      transfer,
      freshness,
      lastVerifiedAt: evidence.length ? evidence[evidence.length - 1].createdAt : null,
      gapTypes,
      priorityScore: hasRealGap ? priorityBreakdown.score : null,
      priorityBreakdown: hasRealGap ? priorityBreakdown : null,
      calcVersion: 1,
      updatedAt: now,
    };

    if (!priorState || priorState.capability !== newState.capability) {
      repo.addProgressEvent({
        id: genId('evt'),
        studentId,
        skillId: skill.id,
        oldCapability: priorState ? priorState.capability : null,
        newCapability: newState.capability,
        reason: isContradictory
          ? 'Contradictory evidence detected across sessions; confidence adjusted, not overwritten.'
          : 'Recomputed from latest evidence.',
        triggeringEvidenceIds: evidence.slice(-3).map((e) => e.id),
        createdAt: now,
      });
    }
    repo.setState(studentId, skill.id, newState);
    results.push({ skill, state: newState });
  }

  const strongest = results.filter((r) => STRONG_STATES.includes(r.state.capability)).map((r) => r.skill.id);
  const developing = results.filter((r) => DEVELOPING_STATES.includes(r.state.capability)).map((r) => r.skill.id);
  const limitedEvidence = results.filter((r) => LIMITED_STATES.includes(r.state.capability)).map((r) => r.skill.id);

  const hiddenStrengths: StudentSkillProfile['hiddenStrengths'] = [];
  const overconfidenceFlags: StudentSkillProfile['overconfidenceFlags'] = [];
  const domains = Array.from(new Set(SKILLS.map((s) => s.domain)));
  for (const domain of domains) {
    const selfPerception = repo.getSelfPerception(studentId, domain);
    if (!selfPerception) continue;
    const domainSkills = results.filter((r) => r.skill.domain === domain);
    const insight = domainPerceptionInsight(selfPerception.selfRating, domainSkills);
    if (insight?.category === 'hidden_strength' && insight.skillId) {
      hiddenStrengths.push({ skillId: insight.skillId, domain, message: insight.message });
    }
    if (insight?.category === 'overconfidence_flag' && insight.skillId) {
      overconfidenceFlags.push({ skillId: insight.skillId, domain, message: insight.message });
    }
  }

  const prerequisiteInsights: StudentSkillProfile['prerequisiteInsights'] = [];
  for (const rel of RELATIONSHIPS) {
    if (rel.type !== 'PREREQUISITE_OF' && rel.type !== 'SUPPORTS') continue;
    const from = results.find((r) => r.skill.id === rel.fromSkillId);
    const to = results.find((r) => r.skill.id === rel.toSkillId);
    if (!from || !to) continue;
    const fromHasGap = from.state.gapTypes.length > 0 && !from.state.gapTypes.includes('INSUFFICIENT_EVIDENCE');
    const toHasGap = to.state.gapTypes.length > 0 && !to.state.gapTypes.includes('INSUFFICIENT_EVIDENCE');
    const bothEnoughEvidence =
      ['MODERATE', 'HIGH', 'VERIFIED'].includes(from.state.evidenceStrength) &&
      ['MODERATE', 'HIGH', 'VERIFIED'].includes(to.state.evidenceStrength);
    if (fromHasGap && toHasGap && bothEnoughEvidence) {
      prerequisiteInsights.push({
        skillId: to.skill.id,
        relatedSkillId: from.skill.id,
        message: `Your ${to.skill.name} performance may be connected to ${from.skill.name} — current evidence suggests both are still developing.`,
      });
    }
  }

  const recommendedFocus = results
    .filter((r) => r.state.priorityScore !== null)
    .sort((a, b) => (b.state.priorityScore ?? 0) - (a.state.priorityScore ?? 0))
    .slice(0, 3)
    .map((r) => ({
      skillId: r.skill.id,
      priority: r.state.priorityBreakdown!,
      reason: r.state.priorityBreakdown!.reasons.join('. '),
    }));

  return {
    studentId,
    generatedAt: now,
    skills: results,
    strongest,
    developing,
    limitedEvidence,
    hiddenStrengths,
    overconfidenceFlags,
    recommendedFocus,
    prerequisiteInsights,
  };
}
