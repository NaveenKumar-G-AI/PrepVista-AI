import type { AIProvider } from '../ai/types.js';
import type { Evidence, GapAssessment, InterventionType, Skill, StudentSkillState } from '../types.js';

/**
 * Builds a deterministic, evidence-grounded learning objective. This is the
 * value returned when AI is unavailable, AND it is the input the optional AI
 * polish pass starts from (Phase 41 — AI enhances wording, it never invents
 * the underlying claim).
 */
export function buildDeterministicObjective(skill: Skill, gap: GapAssessment | null, recentMistake: string | null): string {
  if (!gap || gap.gapType === 'INSUFFICIENT_EVIDENCE') {
    return `Establish an initial evidence base for ${skill.name}.`;
  }
  switch (gap.gapType) {
    case 'TRANSFER_GAP':
      return `Practice applying ${skill.name} techniques in unfamiliar problem framings, not just the standard form.`;
    case 'PREREQUISITE_GAP':
      return `Strengthen the underlying prerequisite before returning to harder ${skill.name} problems.`;
    case 'DEBUGGING_GAP':
      return `Improve debugging of ${recentMistake === 'STATE_MANAGEMENT_ERROR' ? 'stateful/sequential behavior' : 'runtime failures'} in ${skill.name}.`;
    case 'COMPLEXITY_GAP':
      return `Reduce time complexity of ${skill.name} solutions so they hold up on larger inputs.`;
    case 'APPLICATION_GAP':
      return `Improve boundary-condition and edge-case handling in ${skill.name}.`;
    case 'RETENTION_GAP':
      return `Refresh ${skill.name} after a gap in practice to confirm retention.`;
    case 'KNOWLEDGE_GAP':
    default:
      return `Build a more reliable foundation in ${skill.name} through direct, varied practice.`;
  }
}

/**
 * Builds a specific, evidence-citing explanation of WHY this recommendation
 * was made (Phase 37 — never generic). Uses actual counts/dates/categories
 * from the evidence passed in.
 */
export function buildDeterministicExplanation(opts: {
  skill: Skill; state: StudentSkillState | null; gap: GapAssessment | null;
  interventionType: InterventionType; recentEvidence: Evidence[];
}): string {
  const { skill, state, gap, interventionType, recentEvidence } = opts;
  const independentCount = recentEvidence.filter((e) => e.independent).length;
  const total = recentEvidence.length;

  if (!state || total === 0) {
    const base = `You have no recorded attempts on ${skill.name} yet, so this ${describeIntervention(interventionType)} will establish a real evidence baseline instead of guessing.`;
    return gap && gap.explanation ? `${gap.explanation} ${base}` : base;
  }

  const mistakeCounts = new Map<string, number>();
  for (const e of recentEvidence) {
    if (e.mistakeCategory && e.mistakeCategory !== 'NONE') mistakeCounts.set(e.mistakeCategory, (mistakeCounts.get(e.mistakeCategory) ?? 0) + 1);
  }
  const topMistake = [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const parts: string[] = [];
  parts.push(`Over your last ${total} attempt(s) on ${skill.name}, ${independentCount} were fully independent.`);
  if (topMistake) parts.push(`${topMistake[1]} of the recent attempts showed a ${topMistake[0].toLowerCase().replace(/_/g, ' ')} pattern.`);
  if (gap) parts.push(gap.explanation);
  parts.push(`This ${describeIntervention(interventionType)} targets that directly.`);
  return parts.join(' ');
}

function describeIntervention(type: InterventionType): string {
  const map: Record<InterventionType, string> = {
    DIRECT_PRACTICE: 'practice challenge', PREREQUISITE_REVIEW: 'prerequisite-review challenge', BRIDGE_CHALLENGE: 'bridge challenge',
    DEBUGGING_CHALLENGE: 'debugging-focused challenge', CONCEPT_APPLICATION: 'application challenge', TRANSFER_CHALLENGE: 'transfer challenge',
    COMPLEXITY_CHALLENGE: 'complexity-focused challenge', MASTERY_VERIFICATION: 'independent verification challenge', SPACED_REVIEW: 'scheduled review',
    EXPLORATION: 'exploratory assessment', ROLE_SPECIFIC_PRACTICE: 'role-aligned challenge', INTERVIEW_STYLE_CHALLENGE: 'interview-style challenge',
  };
  return map[type];
}

/**
 * Optional AI polish (Phase 38/41): rewrites the deterministic objective for
 * tone/clarity ONLY — the underlying claim always comes from
 * buildDeterministicObjective. If the provider is unavailable, times out, or
 * returns something that fails schema validation, the deterministic text is
 * used verbatim. The system never blocks on AI and never lets AI invent the
 * underlying evidence claim.
 */
export async function polishObjectiveWithAI(deterministic: string, provider: AIProvider): Promise<{ text: string; aiUsed: boolean }> {
  const result = await provider.generateLearningObjective({ deterministicObjective: deterministic });
  if (result) return { text: result, aiUsed: true };
  return { text: deterministic, aiUsed: false };
}
