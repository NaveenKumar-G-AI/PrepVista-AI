/**
 * Optional narrative enhancement layer.
 *
 * Feature 11's explanations (explanationEngine.ts and every detector's own
 * `explanation` field) are fully deterministic, evidence-grounded template
 * output - the service works completely without this file. It exists so
 * that, later, an LLM can be used to rephrase an ALREADY-COMPUTED
 * explanation in a warmer voice - never to invent facts (section 49:
 * "Never let the LLM invent behavioral facts"). The enhancer only ever
 * receives the exact evidence already used, and its output must never
 * introduce a number or claim absent from that evidence.
 *
 * NOT wired up by default. ANTHROPIC_API_KEY is left blank in .env.example
 * on purpose (per request) - PassthroughNarrativeEnhancer is what's
 * actually used until a real key is supplied and this is deliberately
 * switched on in api/controllers/behaviorController.ts.
 */
export interface NarrativeEnhancer {
  enhance(input: { templateText: string; evidence: Record<string, unknown> }): Promise<string>;
}

export class PassthroughNarrativeEnhancer implements NarrativeEnhancer {
  async enhance({ templateText }: { templateText: string; evidence: Record<string, unknown> }): Promise<string> {
    return templateText;
  }
}

/**
 * Reference sketch only. To activate: set ANTHROPIC_API_KEY in .env,
 * implement the fetch call below (POST to the Messages API with an
 * instruction to rephrase-only, never add unstated numbers/claims), and
 * swap PassthroughNarrativeEnhancer for this class where NarrativeEnhancer
 * is constructed.
 */
export class LLMNarrativeEnhancer implements NarrativeEnhancer {
  constructor(private apiKey: string) {}

  async enhance({ templateText }: { templateText: string; evidence: Record<string, unknown> }): Promise<string> {
    if (!this.apiKey) return templateText; // fail safe: never block behavior on a missing key
    // Intentionally unimplemented in this prototype. Wire up:
    //   POST https://api.anthropic.com/v1/messages
    //   system: "Rephrase the given sentence only. Do not add any number,
    //            comparison, or claim not already present in it."
    //   messages: [{ role: 'user', content: templateText }]
    // and fall back to templateText on any error or unexpected output.
    return templateText;
  }
}
