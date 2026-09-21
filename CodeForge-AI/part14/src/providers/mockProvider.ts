import type { LLMProvider, ProviderCallArgs, ProviderCallResult } from "./provider.interface";

/**
 * TEST-ONLY. Never wire this into production — see "NO MOCK PRODUCTION
 * LOGIC" in the product spec. Exists purely so coachEngine can be exercised
 * deterministically in automated tests without live provider credentials.
 */
export class ScriptedMockProvider implements LLMProvider {
  readonly name = "mock";
  readonly supportsLargeContext = true;
  readonly speedTier = "fast" as const;
  private calls = 0;

  constructor(private script: string[]) {
    if (script.length === 0) throw new Error("ScriptedMockProvider needs at least one scripted response");
  }

  async generate(_args: ProviderCallArgs): Promise<ProviderCallResult> {
    const rawText = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    return { rawText, latencyMs: 1, promptTokens: 10, completionTokens: 10 };
  }
}
