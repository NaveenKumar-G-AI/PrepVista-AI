export interface TeachBackResult {
  criteriaMet: Record<string, boolean>;
  passed: boolean;
  missing: string[];
}

// Deterministic keyword-level coverage check per success criterion (section
// 40-41). This is intentionally conservative: it can be augmented (never
// weakened) by an AI second opinion - see ai/client.ts mergeTeachBackOpinion.
const CRITERIA_MATCHERS: Record<string, RegExp> = {
  identifies_original_value: /\b(original|starting|before|base)\b/i,
  selects_correct_reference: /(divide|÷|\/).{0,25}(original|starting|before|base)|(original|starting|before|base).{0,25}(divide|÷|\/)/i,
  explains_reasoning: /.{20,}/,
};

export function evaluateTeachBack(text: string, criteria: string[]): TeachBackResult {
  const trimmed = (text || "").trim();
  const criteriaMet: Record<string, boolean> = {};
  for (const c of criteria) {
    const matcher = CRITERIA_MATCHERS[c];
    criteriaMet[c] = matcher ? matcher.test(trimmed) : false;
  }
  const missing = criteria.filter((c) => !criteriaMet[c]);
  return { criteriaMet, passed: missing.length === 0, missing };
}
