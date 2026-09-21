import type { AIFinding } from './contract.js';
import type { Skill, SkillEvidence, StudentSkillState } from '../domain/types.js';

export interface NarrativeInput {
  skill: Skill;
  state: StudentSkillState;
  evidence: SkillEvidence[];
  hint?: 'hidden_strength' | 'overconfidence_flag' | 'recommended_focus' | 'general';
}

export interface AIProvider {
  name: string;
  generateInsight(input: NarrativeInput): Promise<unknown>;
}

/**
 * Deterministic, template-based provider.
 *
 * This is not a stand-in that pretends to be AI — it's the real,
 * production-safe default described in Phase 21 ("AI failure fallback").
 * It reads the same StudentSkillState fields a real LLM call would read and
 * slot-fills them into pre-written, reviewed copy. A real provider (for
 * example, one that calls the Anthropic API — see README) can implement the
 * same AIProvider interface and be passed to narrativeService instead; its
 * output still goes through the same validator, and still falls back to
 * this class if it fails or returns something invalid. The student never
 * sees "AI failed" — see ai/narrative.ts.
 */
export class TemplateProvider implements AIProvider {
  name = 'template';

  async generateInsight(input: NarrativeInput): Promise<AIFinding> {
    const { skill, state, evidence, hint } = input;
    const findingType = hint ?? 'general';
    const evidenceIds = evidence.slice(-5).map((e) => e.id);

    let studentMessage: string;
    let interpretation: string;

    if (findingType === 'hidden_strength') {
      studentMessage = `You rated this as an area of concern, but ${skill.name} shows stronger performance than expected.`;
      interpretation = `Self-rating was below the observed capability (${state.capability}) for ${skill.name}.`;
    } else if (findingType === 'overconfidence_flag') {
      studentMessage = `Your fundamentals look solid overall — ${skill.name} is still developing relative to how confident you felt.`;
      interpretation = `Self-rating exceeded the observed capability (${state.capability}) for ${skill.name}.`;
    } else if (findingType === 'recommended_focus') {
      studentMessage = `${skill.name} is your highest-impact focus right now — the foundation is there, and closing this gap should help related topics too.`;
      interpretation = `${skill.name} ranked highest on the priority engine given its gap type(s) (${state.gapTypes.join(', ')}) and evidence strength (${state.evidenceStrength}).`;
    } else {
      studentMessage = `${skill.name}: currently ${state.capability.toLowerCase().replace(/_/g, ' ')}, based on ${evidence.length} attempt(s). Evidence strength: ${state.evidenceStrength.toLowerCase()}.`;
      interpretation = `Deterministic summary generated from StudentSkillState for ${skill.name}.`;
    }

    return {
      findingType,
      skillId: skill.id,
      evidenceIds,
      interpretation,
      confidence: state.evidenceStrength === 'HIGH' || state.evidenceStrength === 'VERIFIED' ? 0.8 : state.evidenceStrength === 'MODERATE' ? 0.55 : 0.3,
      recommendedFocus: findingType === 'recommended_focus',
      studentMessage,
    } satisfies AIFinding;
  }
}
