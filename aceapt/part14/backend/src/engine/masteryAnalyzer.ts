/**
 * Ties evidenceEngine + analysisEngine + stateEngine + rootCauseEngine
 * together into a single SkillAnalysis. This is the one function the API
 * layer calls — routes never touch the lower-level engines directly, so
 * "what counts as evidence" and "how a state is derived" stay centralised.
 *
 * Section 45 (performance): recomputing from raw events on every call is
 * fine at prototype scale (tens of skills, hundreds of events). A
 * production version would cache the resulting MasterySnapshot per skill
 * and invalidate it when a new AttemptEvent lands for that skill, rather
 * than recomputing on every request.
 */

import { analyzeEvidence } from './analysisEngine';
import { buildEvidence } from './evidenceEngine';
import { computeCompositionGap, computeRootCause } from './rootCauseEngine';
import { deriveConfidence, deriveState, nextActionFor, toDisplayLabel } from './stateEngine';
import { AttemptEvent, Question, Skill, SkillAnalysis, SkillEvidence } from '../domain/types';

export function computeAllEvidence(allAttempts: AttemptEvent[], skills: Skill[], questionsById: Map<string, Question>): Map<string, SkillEvidence> {
  const map = new Map<string, SkillEvidence>();
  for (const skill of skills) {
    map.set(skill.id, buildEvidence(skill.id, allAttempts, questionsById));
  }
  return map;
}

export function computeSkillAnalysis(
  skillId: string,
  skills: Skill[],
  evidenceById: Map<string, SkillEvidence>
): SkillAnalysis {
  const skill = skills.find((s) => s.id === skillId);
  const evidence = evidenceById.get(skillId);
  if (!skill || !evidence) {
    throw new Error(`Unknown skill: ${skillId}`);
  }

  const analysis = analyzeEvidence(evidence);

  const rootCauseSkillIds = computeRootCause(skillId, skills, evidenceById);
  if (rootCauseSkillIds.length > 0) analysis.flags.push('ROOT_CAUSE_GAP');
  if (computeCompositionGap(skill, evidenceById)) analysis.flags.push('COMPOSITION_GAP');

  const { state, reason: stateReason } = deriveState(evidence, analysis);
  const { confidence, reason: confidenceReason } = deriveConfidence(evidence, analysis);

  return {
    skillId,
    evidence,
    sufficiency: analysis.sufficiency,
    difficultyCeiling: analysis.difficultyCeiling,
    stability: analysis.stability,
    flags: analysis.flags,
    state,
    displayLabel: toDisplayLabel(state, analysis.flags),
    confidence,
    confidenceReason: `${stateReason} ${confidenceReason}`,
    rootCauseSkillIds,
    nextAction: nextActionFor(state, analysis.flags, skill.name),
  };
}

export function computeAllAnalyses(allAttempts: AttemptEvent[], skills: Skill[], questionsById: Map<string, Question>): Map<string, SkillAnalysis> {
  const evidenceById = computeAllEvidence(allAttempts, skills, questionsById);
  const result = new Map<string, SkillAnalysis>();
  for (const skill of skills) {
    result.set(skill.id, computeSkillAnalysis(skill.id, skills, evidenceById));
  }
  return result;
}
