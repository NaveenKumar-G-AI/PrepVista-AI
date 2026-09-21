// AI provider abstraction. The engine never calls Groq/Gemini/etc directly —
// everything goes through this interface, matching the spec's "use the
// existing provider abstraction, don't hard-code provider logic into
// business logic" requirement. Swap in your real provider client by
// implementing this interface (see providers.ts for illustrative adapters).

import type { z } from "zod";

export type AIResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; reason: "NOT_CONFIGURED" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_RESPONSE"; detail?: string };

export interface AIProvider {
  readonly name: string;
  readonly configured: boolean;
  completeStructured<T>(params: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<AIResult<T>>;
}

/**
 * Used when no provider is configured (e.g. no API keys set yet). Every
 * caller in this engine is required to handle `{ ok: false }` gracefully and
 * fall back to a deterministic heuristic with reduced confidence — never a
 * crash, never a fabricated result. This is what lets the whole pipeline run
 * end-to-end with zero keys, which is exactly what the test suite exercises.
 */
export class NullAIProvider implements AIProvider {
  readonly name = "none";
  readonly configured = false;
  async completeStructured<T>(): Promise<AIResult<T>> {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
}
