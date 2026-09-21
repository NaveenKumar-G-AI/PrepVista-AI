import { generateHintText } from '../llm/llmService';

export const MAX_HINT_LEVEL = 5;

export interface HintResult {
  level: number;
  text: string;
  isFinal: boolean;
  source: 'llm' | 'template';
}

/**
 * Returns the next hint in the ladder. Never jumps straight to level 5 —
 * callers are expected to request level = previousLevel + 1, one at a time
 * (Section 9: "avoid immediately giving the final answer").
 */
export async function getHint(level: number, skillLabel: string, microSkillLabel?: string): Promise<HintResult> {
  const clamped = Math.max(1, Math.min(level, MAX_HINT_LEVEL));
  const { text, source } = await generateHintText({ level: clamped, skillLabel, microSkillLabel });
  return { level: clamped, text, isFinal: clamped >= MAX_HINT_LEVEL, source };
}
