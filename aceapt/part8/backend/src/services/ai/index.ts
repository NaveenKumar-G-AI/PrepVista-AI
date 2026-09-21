import type { AIProvider } from "./types.js";
import { makeAnthropicProviderFromEnv } from "./anthropicProvider.js";

let cached: AIProvider | null | undefined;

/** Returns null (not a throw) when no provider is configured - every caller
 *  is expected to handle "no AI available" as a normal, expected state
 *  (fall back to the seeded pool), not an exceptional one. */
export function getAIProvider(): AIProvider | null {
  if (cached !== undefined) return cached;
  cached = makeAnthropicProviderFromEnv();
  return cached;
}

export type { AIProvider, EquivalentQuestionRequest, GeneratedQuestionCandidate, MasterySummaryRequest } from "./types.js";
export { AIGenerationUnavailableError } from "./types.js";
