// Semantic equivalence: "does this free-text claim describe these verified
// facts?" AI is used to interpret ambiguous natural language, but it is
// schema-validated and never treated as a source of new facts — the facts
// themselves always come from the deterministic evidence adapters. When no
// AI provider is configured, a deterministic token-overlap heuristic is used
// instead so the pipeline still runs end-to-end (with lower confidence).

import { z } from "zod";
import type { AIProvider } from "./provider";
import { buildSemanticEquivalencePrompt } from "./promptTemplates";

const EquivalenceSchema = z.object({
  equivalent: z.enum(["YES", "PARTIAL", "NO"]),
  rationale: z.string().max(400).optional(),
});

export type EquivalenceVerdict = "YES" | "PARTIAL" | "NO" | "AI_UNAVAILABLE";

export async function checkSemanticEquivalence(params: {
  claimText: string;
  candidateFacts: string[];
  aiProvider: AIProvider;
}): Promise<{ verdict: EquivalenceVerdict; rationale?: string; source: "ai" | "fallback" }> {
  if (params.aiProvider.configured) {
    const { system, user } = buildSemanticEquivalencePrompt(params);
    const result = await params.aiProvider.completeStructured({ system, user, schema: EquivalenceSchema, maxTokens: 300 });
    if (result.ok) {
      return { verdict: result.data.equivalent, rationale: result.data.rationale, source: "ai" };
    }
    // Falls through to the deterministic fallback on any AI failure (timeout, bad JSON, provider error).
  }
  return { verdict: fallbackTokenOverlapVerdict(params.claimText, params.candidateFacts), source: "fallback" };
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or",
  "it", "this", "that", "i", "my", "we", "was", "were", "with", "as", "be", "by",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function fallbackTokenOverlapVerdict(claimText: string, facts: string[]): "YES" | "PARTIAL" | "NO" {
  const claimTokens = tokenize(claimText);
  const factTokens = tokenize(facts.join(" "));
  if (claimTokens.size === 0 || factTokens.size === 0) return "NO";
  let overlap = 0;
  for (const t of claimTokens) if (factTokens.has(t)) overlap++;
  const ratio = overlap / claimTokens.size;
  if (ratio >= 0.5) return "YES";
  if (ratio >= 0.2) return "PARTIAL";
  return "NO";
}
