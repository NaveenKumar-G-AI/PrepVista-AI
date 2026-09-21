/**
 * Provider router.
 *
 * - Picks a "fast" vs "strong" model tier from the assigned assistance
 *   level (DIRECTION/CONCEPT are cheap; TARGETED and deeper get the
 *   stronger tier) — this is the "model routing" cost control the spec
 *   asks for, and it's config-driven, not a hardcoded provider choice.
 * - Tries the configured primary provider first, falls back to the
 *   other one on failure, and throws a typed error only if NEITHER is
 *   configured/available — the caller (service.ts) is responsible for
 *   turning that into the deterministic-fallback hint path rather than
 *   surfacing a raw error to the student (see "Failure isolation").
 */

import { AssistanceLevel } from "../types";
import { AIProvider, ModelTier, ProviderCallParams, ProviderCallResult, ProviderError, ProviderName } from "./types";

const STRONG_TIER_LEVELS: AssistanceLevel[] = ["TARGETED", "SPECIFIC", "DETAILED", "SOLUTION_ASSISTANCE"];

export function tierForLevel(level: AssistanceLevel): ModelTier {
  return STRONG_TIER_LEVELS.includes(level) ? "strong" : "fast";
}

export interface RouterConfig {
  primary: ProviderName;
  timeoutMs: number;
}

export function loadRouterConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RouterConfig {
  const primary = env.HINT_LADDER_PRIMARY_PROVIDER === "gemini" ? "gemini" : "groq";
  return { primary, timeoutMs: 12_000 };
}

export class AllProvidersUnavailableError extends Error {
  constructor(public readonly attempts: Array<{ provider: ProviderName; error: string }>) {
    super(`No AI provider is available: ${attempts.map((a) => `${a.provider}: ${a.error}`).join("; ")}`);
    this.name = "AllProvidersUnavailableError";
  }
}

export class ProviderRouter {
  constructor(
    private readonly providers: Partial<Record<ProviderName, AIProvider>>,
    private readonly config: RouterConfig
  ) {}

  async generateForLevel(
    level: AssistanceLevel,
    prompts: { systemPrompt: string; userPrompt: string }
  ): Promise<ProviderCallResult> {
    const tier = tierForLevel(level);
    const order = this.providerOrder();
    const attempts: Array<{ provider: ProviderName; error: string }> = [];

    for (const name of order) {
      const provider = this.providers[name];
      if (!provider || !provider.isConfigured()) {
        attempts.push({ provider: name, error: "not configured" });
        continue;
      }
      try {
        const params: ProviderCallParams = { ...prompts, tier, timeoutMs: this.config.timeoutMs };
        return await provider.generate(params);
      } catch (err) {
        attempts.push({ provider: name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    throw new AllProvidersUnavailableError(attempts);
  }

  private providerOrder(): ProviderName[] {
    const other: ProviderName = this.config.primary === "groq" ? "gemini" : "groq";
    return [this.config.primary, other];
  }
}
