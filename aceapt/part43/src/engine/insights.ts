import { AdaptiveDiagnosticState, SkillEvidence } from '../domain/state';
import { Skill } from '../domain/types';
import { NextBestAction } from '../domain/dto';

// ---------------------------------------------------------------------------
// Explainability / "Why" (spec sections 51-52)
// ---------------------------------------------------------------------------

export interface SkillExplanation {
  skillId: string;
  skillLabel: string;
  conclusion: string;
  evidenceSummary: {
    questionCount: number;
    correctCount: number;
    incorrectCount: number;
    relativeResponseTime: 'faster than typical' | 'typical' | 'slower than typical';
  };
  confidence: 'low' | 'moderate' | 'high';
  narrative: string;
}

const CAPABILITY_TEXT: Record<string, string> = {
  unknown: 'not yet explored',
  emerging: 'an early-stage area to build up',
  developing: 'developing, with room to strengthen',
  proficient: 'a solid, reliable area',
  advanced: 'a clear strength',
};

export function explainSkill(skill: Skill, evidence: SkillEvidence): SkillExplanation {
  const relative: SkillExplanation['evidenceSummary']['relativeResponseTime'] =
    evidence.relativeResponseTimeEma < 0.85 ? 'faster than typical' : evidence.relativeResponseTimeEma > 1.2 ? 'slower than typical' : 'typical';

  return {
    skillId: skill.id,
    skillLabel: skill.label,
    conclusion: buildConclusion(skill, evidence),
    evidenceSummary: {
      questionCount: evidence.evidenceCount,
      correctCount: evidence.correctCount,
      incorrectCount: evidence.incorrectCount,
      relativeResponseTime: relative,
    },
    confidence: evidence.confidenceLabel,
    narrative: buildNarrative(skill, evidence, relative),
  };
}

function buildConclusion(skill: Skill, e: SkillEvidence): string {
  if (e.evidenceCount === 0) return `${skill.label}: not yet explored.`;
  if (e.potentialTransferGap) {
    return `${skill.label}: solid on familiar patterns, with a possible gap applying it in unfamiliar contexts.`;
  }
  return `${skill.label}: ${CAPABILITY_TEXT[e.capabilityLabel]}.`;
}

function buildNarrative(skill: Skill, e: SkillEvidence, relative: string): string {
  if (e.evidenceCount === 0) {
    return `We haven't asked about ${skill.label} yet, so there's no evidence either way.`;
  }
  const accuracyPct = Math.round((e.correctCount / e.evidenceCount) * 100);
  let sentence = `Across ${e.evidenceCount} question${e.evidenceCount === 1 ? '' : 's'} on ${skill.label}, accuracy was around ${accuracyPct}%, answered ${relative}.`;
  if (e.potentialTransferGap) {
    sentence += ' Performance held up on familiar-style questions but dropped when the same idea was framed in an unfamiliar way.';
  }
  if (e.isUnstable) {
    sentence += ' Results have been inconsistent so far, so this conclusion is still being verified.';
  }
  return sentence;
}

// ---------------------------------------------------------------------------
// Next-best-action (spec sections 53-54)
// ---------------------------------------------------------------------------

export function buildNextBestActions(state: AdaptiveDiagnosticState, skills: Skill[]): NextBestAction[] {
  const scoped = skills.filter((s) => state.config.requiredDomains.includes(s.domain));

  const actions = scoped.map((skill) => {
    const e = state.skillEvidence[skill.id];
    const severity = severityOf(e?.capabilityLabel ?? 'unknown');
    const placementWeight = state.config.objective === 'placement_preparation' ? skill.placementRelevance ?? 0.5 : 0.5;
    const companyWeight =
      state.config.objective === 'company_preparation' && state.config.companyId
        ? skill.companyRelevance?.[state.config.companyId] ?? 0.5
        : 0.5;
    const gapBoost = e?.potentialTransferGap ? 1.2 : 1;
    const priority = severity * placementWeight * companyWeight * gapBoost;

    return {
      skillId: skill.id,
      skillLabel: skill.label,
      status: e?.capabilityLabel ?? 'unknown',
      priority,
      recommendedAction: recommendationFor(e),
      reason: reasonFor(skill, e),
    };
  });

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

function severityOf(label: string): number {
  return { unknown: 0.9, emerging: 1, developing: 0.7, proficient: 0.3, advanced: 0.1 }[label] ?? 0.5;
}

function recommendationFor(e: SkillEvidence | undefined): string {
  if (!e || e.evidenceCount === 0) return 'Initial exploratory practice';
  if (e.potentialTransferGap) return 'Guided mixed-context / applied practice';
  if (e.capabilityLabel === 'emerging' || e.capabilityLabel === 'developing') return 'Guided foundational practice';
  if (e.needsSpeedCheck) return 'Timed fluency drills';
  return 'Maintenance practice';
}

function reasonFor(skill: Skill, e: SkillEvidence | undefined): string {
  if (!e || e.evidenceCount === 0) return `No evidence gathered yet for ${skill.label}.`;
  if (e.potentialTransferGap) return `Strong on familiar ${skill.label} questions, weaker once the context changed.`;
  if (e.capabilityLabel === 'emerging' || e.capabilityLabel === 'developing') return `Repeated errors on ${skill.label} questions.`;
  return `${skill.label} is currently solid; light maintenance keeps it that way.`;
}
