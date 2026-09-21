import { generateExplanation } from '../llm/llmService';

export const EXPLANATION_STYLES = [
  'simple',
  'real_world',
  'analogy',
  'visual',
  'formula_first',
  'step_by_step',
  'worked_example',
  'counterexample',
] as const;

export type ExplanationStyle = (typeof EXPLANATION_STYLES)[number];

export const EXPLANATION_STYLE_LABELS: Record<ExplanationStyle, string> = {
  simple: 'Simple explanation',
  real_world: 'Real-world example',
  analogy: 'Analogy',
  visual: 'Visual explanation',
  formula_first: 'Formula-first',
  step_by_step: 'Step-by-step',
  worked_example: 'Worked example',
  counterexample: 'Counterexample',
};

/**
 * Picks the next representation style, guaranteed different from every style
 * already tried in this struggle-session (Section 11: don't just repeat the
 * same explanation). Falls back to cycling once every style has been used.
 */
export function nextStyle(previousStyles: ExplanationStyle[]): ExplanationStyle {
  const untried = EXPLANATION_STYLES.filter((s) => !previousStyles.includes(s));
  if (untried.length > 0) return untried[0];
  // Every style has been tried — cycle back to the least-recently-used one.
  return EXPLANATION_STYLES[previousStyles.length % EXPLANATION_STYLES.length];
}

export async function explainDifferently(args: {
  skillLabel: string;
  microSkillLabel?: string;
  rootCauseLabel: string;
  previousStyles: ExplanationStyle[];
}): Promise<{ style: ExplanationStyle; styleLabel: string; text: string; source: 'llm' | 'template' }> {
  const style = nextStyle(args.previousStyles);
  const { text, source } = await generateExplanation({
    skillLabel: args.skillLabel,
    microSkillLabel: args.microSkillLabel,
    style,
    rootCauseLabel: args.rootCauseLabel,
  });
  return { style, styleLabel: EXPLANATION_STYLE_LABELS[style], text, source };
}
