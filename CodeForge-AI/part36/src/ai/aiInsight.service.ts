import { env } from '../config/env';
import { logger } from '../utils/logger';
import { checkGrounding } from './groundingCheck';
import { aiProvider } from './aiProvider';

export interface ExecutiveNarrativeInput {
  cohortName: string;
  strongestAreas: string[];
  priorityGaps: string[];
  highestImpactRoleGap: string | null;
  trainingPriorities: string[];
  evidenceCoverageSummary: Record<string, string>;
  observedGrowth: string[];
}

export interface ExecutiveNarrativeResult {
  narrative: string | null;
  groundingWarning: boolean;
}

const SYSTEM_PROMPT = [
  'You summarize cohort technical-readiness analytics for a college placement officer.',
  'You will be given ONLY structured aggregate facts — no individual student data.',
  'Rules:',
  '- Only state facts present in the JSON you are given. Never invent a number, percentage, or count.',
  '- Never claim training caused an outcome; use language like "observed improvement".',
  '- If evidence coverage for something is low or insufficient, say so plainly instead of a strength/weakness claim.',
  '- Write 3-5 sentences, plain language, no markdown, no bullet points.',
].join('\n');

/**
 * Section 54-56: AI is optional enrichment layered on top of
 * structured aggregates that already fully answer the dashboard on
 * their own. If AI_PROVIDER=none, the call fails, or the output fails
 * the grounding check, this returns narrative: null — callers keep
 * serving the structured data either way. AI failure must never fail
 * the dashboard.
 */
export async function generateExecutiveNarrative(input: ExecutiveNarrativeInput): Promise<ExecutiveNarrativeResult> {
  if (env.AI_PROVIDER === 'none') {
    return { narrative: null, groundingWarning: false };
  }

  try {
    const prompt = `${SYSTEM_PROMPT}\n\nStructured aggregate facts:\n${JSON.stringify(input, null, 2)}`;
    const text = await aiProvider.generateText(prompt);
    if (!text) return { narrative: null, groundingWarning: false };

    const { grounded, ungroundedTokens } = checkGrounding(text, input);
    if (!grounded) {
      logger.warn({ ungroundedTokens }, 'AI executive narrative failed grounding check; discarding.');
      return { narrative: null, groundingWarning: true };
    }

    return { narrative: text.trim(), groundingWarning: false };
  } catch (err) {
    logger.error({ err }, 'AI narrative generation failed; dashboard will render without it.');
    return { narrative: null, groundingWarning: false };
  }
}
