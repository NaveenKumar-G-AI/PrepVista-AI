import type { AIProvider, TestIdeaProposal } from "./types";
import { MockAIProvider } from "./providers/mock";
import { GroqProvider } from "./providers/groq";
import { GeminiProvider } from "./providers/gemini";

export interface AIUsageEvent {
  providerId: string;
  operation: "proposeTestIdeas" | "explainResult";
  ok: boolean;
  errorMessage?: string;
  durationMs: number;
}

export type UsageSink = (event: AIUsageEvent) => void;

/**
 * Builds the provider chain from AI_PROVIDER_ORDER. Falls back through
 * providers in order and finally to MockAIProvider so that a fully
 * unconfigured deployment (no keys at all — exactly this repo's state
 * right now) still works end-to-end for test generation assistance,
 * clearly logged as such via the usage sink rather than silently.
 */
export function buildProviderChain(env: NodeJS.ProcessEnv = process.env): AIProvider[] {
  const order = (env.AI_PROVIDER_ORDER ?? "groq,gemini").split(",").map((s) => s.trim());
  const chain: AIProvider[] = [];
  for (const name of order) {
    if (name === "groq" && env.GROQ_API_KEY) {
      chain.push(new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL));
    } else if (name === "gemini" && env.GEMINI_API_KEY) {
      chain.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL));
    }
  }
  chain.push(new MockAIProvider()); // always-available final fallback
  return chain;
}

export class FallbackAIProvider implements AIProvider {
  id = "fallback-chain";
  constructor(
    private chain: AIProvider[],
    private usageSink: UsageSink = () => {}
  ) {}

  async proposeTestIdeas(args: Parameters<AIProvider["proposeTestIdeas"]>[0]): Promise<TestIdeaProposal[]> {
    return this.tryEach("proposeTestIdeas", (p) => p.proposeTestIdeas(args), []);
  }

  async explainResult(args: Parameters<AIProvider["explainResult"]>[0]): Promise<string> {
    return this.tryEach("explainResult", (p) => p.explainResult(args), "");
  }

  private async tryEach<T>(
    operation: AIUsageEvent["operation"],
    call: (p: AIProvider) => Promise<T>,
    fallbackValue: T
  ): Promise<T> {
    let lastErr: Error | null = null;
    for (const provider of this.chain) {
      const start = Date.now();
      try {
        const result = await call(provider);
        this.usageSink({ providerId: provider.id, operation, ok: true, durationMs: Date.now() - start });
        return result;
      } catch (err) {
        lastErr = err as Error;
        this.usageSink({
          providerId: provider.id,
          operation,
          ok: false,
          errorMessage: lastErr.message,
          durationMs: Date.now() - start,
        });
        // fall through to next provider in the chain
      }
    }
    // Every provider (including the mock, which should never itself fail)
    // failed. AI assistance is best-effort — this must never throw into
    // deterministic evaluation code. See docs/ARCHITECTURE.md#ai-cost-control.
    console.error(`AI provider chain exhausted for ${operation}:`, lastErr?.message);
    return fallbackValue;
  }
}
