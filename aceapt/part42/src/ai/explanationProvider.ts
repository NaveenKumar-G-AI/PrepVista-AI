import type { ExplanationProvider } from "../types/contracts.js";
import { deterministicExplanationProvider } from "./deterministicFallback.js";
import { createGroqExplanationProvider } from "./groqExplanationAdapter.js";

/**
 * Module 39/40/48: no API key configured, a network error, a timeout, or a
 * malformed completion all land in the same place — the deterministic
 * fallback — silently from the student's point of view. Nothing about
 * scoring ever depends on whether this succeeds; only how varied the
 * prose sounds.
 */
export function createExplanationProvider(apiKey: string | undefined, model?: string): ExplanationProvider {
  if (!apiKey) return deterministicExplanationProvider;

  const groq = createGroqExplanationProvider(apiKey, model);

  return {
    async explain(input) {
      try {
        return await groq.explain(input);
      } catch {
        return deterministicExplanationProvider.explain(input);
      }
    },
  };
}
