// ---------------------------------------------------------------------------
// AI is an enhancement, never a dependency (section 69). Every other graph
// operation (traversal, validation, evidence, root-cause, priority) is pure
// deterministic logic and works with zero AI involvement. This adapter is
// only invoked from an explicit admin "suggest relationships" action — never
// on page load, never per question attempt, never per traversal (section 68).
//
// Output is ALWAYS a suggestion: callers must persist it as
// source=AI_SUGGESTED, status=DRAFT and route it through the same
// admin-approval path as any other proposed relationship (section 19). This
// adapter has no ability to write to the graph itself.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { env, isAiSuggestionAvailable } from '../config/env';
import { logger } from '../utils/logger';
import { zEvidenceConfidence } from '../domain/enums';
import type { AIRelationshipSuggestion, AISuggestionAdapter } from './types';

const SuggestionSchema = z.object({
  suggestedType: z.enum(['PREREQUISITE', 'DEPENDS_ON', 'RELATED_TO', 'BUILDS', 'TRANSFER_TO', 'PART_OF', 'COMMON_ERROR_SOURCE']),
  rationale: z.string().min(1).max(400),
  confidence: zEvidenceConfidence,
});

const SYSTEM_PROMPT = `You are assisting a curriculum team by proposing a possible relationship between two aptitude-exam skills. You never make the decision — a human always reviews your suggestion before it can affect any student. Respond with ONLY a JSON object matching this shape, nothing else: {"suggestedType": one of PREREQUISITE|DEPENDS_ON|RELATED_TO|BUILDS|TRANSFER_TO|PART_OF|COMMON_ERROR_SOURCE, "rationale": a short one-sentence pedagogical justification, "confidence": one of NONE|LOW|MODERATE|HIGH}. If you are not reasonably confident a real relationship exists, set confidence to LOW and say so in the rationale rather than inventing one.`;

export const aiSuggestionAdapter: AISuggestionAdapter = {
  isAvailable() {
    return isAiSuggestionAvailable();
  },

  async suggestRelationship(input): Promise<AIRelationshipSuggestion | null> {
    if (!isAiSuggestionAvailable()) return null;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Domain: ${input.domainContext}\nSkill A: ${input.fromSkillName}\nSkill B: ${input.toSkillName}\n\nIs there a plausible relationship where Skill A relates to Skill B? Respond with the JSON object only.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        logger.warn('ai_suggestion_adapter_http_error', { status: response.status });
        return null;
      }

      const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n')
        .trim();

      const cleaned = text.replace(/^```json\s*|```$/g, '').trim();
      const parsed = SuggestionSchema.safeParse(JSON.parse(cleaned));
      if (!parsed.success) {
        logger.warn('ai_suggestion_adapter_unparseable_response', { issues: parsed.error.issues });
        return null;
      }
      return parsed.data;
    } catch (error) {
      logger.error('ai_suggestion_adapter_failed', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
};
