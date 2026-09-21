// Lightweight text-similarity check used by the question quality pipeline's
// duplicate/near-duplicate gate (section 47 of the spec). Deliberately not a
// full semantic-similarity model - a cheap, deterministic, explainable
// Jaccard-over-tokens check is enough to catch "AI regenerated basically the
// same question" without needing another network call.

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Above this, two prompts are treated as near-duplicates. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.72;
