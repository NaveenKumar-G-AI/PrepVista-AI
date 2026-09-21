// Accuracy Guardrail (spec section 29): speed is never allowed to improve
// "blindly" - this is the small, explicit check that the rest of the system
// (trainingPolicy, services, UI) reads to know whether the guardrail is
// currently holding.

export const DEFAULT_GUARDRAIL_ACCURACY = 0.85;

export interface GuardrailCheck {
  breached: boolean;
  marginPct: number; // positive = comfortably above guardrail, negative = below
  rollingAccuracy: number;
}

export function checkAccuracyGuardrail(recentCorrectness: boolean[], guardrail: number): GuardrailCheck {
  if (recentCorrectness.length === 0) {
    return { breached: false, marginPct: 0, rollingAccuracy: 0 };
  }
  const rollingAccuracy = recentCorrectness.filter(Boolean).length / recentCorrectness.length;
  return {
    breached: rollingAccuracy < guardrail,
    marginPct: Math.round((rollingAccuracy - guardrail) * 1000) / 10,
    rollingAccuracy,
  };
}
