// This is a telemetry signal, not the primary defense. The primary defense
// is structural: untrusted content never has instruction-following
// authority in the first place (see prompt/buildPrompt.ts's delimiter tags
// and COACH_SYSTEM_POLICY rule 3). Regex can't reliably catch every
// injection attempt, but it's useful for flagging attempts so the product
// can track them, as the spec's Observability section requires.
const INJECTION_PATTERNS = [
  /ignore (all|previous|prior) instructions/i,
  /reveal (the )?(hidden|system) (tests?|prompt)/i,
  /you are now/i,
  /disregard (the )?(rules|policy)/i,
  /print (the )?system prompt/i,
  /act as (an? )?(admin|root|developer mode)/i,
];

export function detectInjectionAttempt(...texts: (string | undefined)[]): boolean {
  const joined = texts.filter(Boolean).join("\n");
  return INJECTION_PATTERNS.some((pattern) => pattern.test(joined));
}
