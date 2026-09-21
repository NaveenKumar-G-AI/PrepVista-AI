import { AIFindingSchema } from './contract.js';
import type { AIFinding } from './contract.js';
import { TemplateProvider } from './provider.js';
import type { AIProvider, NarrativeInput } from './provider.js';
import { genId } from '../domain/id.js';
import type { SkillInsight } from '../domain/types.js';

function toInsight(studentId: string, f: AIFinding, generatedBy: 'ai' | 'template'): SkillInsight {
  return {
    id: genId('insight'),
    studentId,
    findingType: f.findingType,
    skillId: f.skillId,
    evidenceIds: f.evidenceIds,
    interpretation: f.interpretation,
    confidence: f.confidence,
    recommendedFocus: f.recommendedFocus,
    studentMessage: f.studentMessage,
    generatedBy,
    validated: true,
    createdAt: new Date().toISOString(),
  };
}

/** skillId must match what was asked about, and every evidenceId must
 *  actually belong to this student's evidence for this skill — an AI
 *  can't cite evidence that doesn't exist or isn't the student's. */
function semanticsOk(f: AIFinding, input: NarrativeInput): boolean {
  if (f.skillId !== input.skill.id) return false;
  const validEvidenceIds = new Set(input.evidence.map((e) => e.id));
  return f.evidenceIds.every((id) => validEvidenceIds.has(id));
}

export async function generateNarrative(studentId: string, provider: AIProvider, input: NarrativeInput): Promise<SkillInsight> {
  const fallback = new TemplateProvider();

  let raw: unknown;
  try {
    raw = await provider.generateInsight(input);
  } catch {
    const fallbackRaw = await fallback.generateInsight(input);
    return toInsight(studentId, AIFindingSchema.parse(fallbackRaw), 'template');
  }

  const parsed = AIFindingSchema.safeParse(raw);
  if (!parsed.success || !semanticsOk(parsed.data, input)) {
    // Rejected — logged here as a console line for the prototype; a real
    // deployment would write this to an observability pipeline for review.
    console.warn(`[ai] rejected output from provider "${provider.name}" for skill ${input.skill.id}; falling back to template.`);
    const fallbackRaw = await fallback.generateInsight(input);
    return toInsight(studentId, AIFindingSchema.parse(fallbackRaw), 'template');
  }

  return toInsight(studentId, parsed.data, provider.name === 'template' ? 'template' : 'ai');
}
