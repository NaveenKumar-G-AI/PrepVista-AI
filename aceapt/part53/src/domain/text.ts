/** Lowercases, strips punctuation, collapses whitespace — used for exact-duplicate hashing
 *  and as the tokenization basis for Jaccard similarity (section 95: "exact text hash,
 *  normalized text, lexical similarity ... Not one method alone"). */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): Set<string> {
  return new Set(normalizeText(input).split(' ').filter(Boolean));
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** A coarse structural fingerprint (section 96): same skill + same computation "shape" + same
 *  option count is a strong signal of a hidden duplicate even when the wording differs a lot.
 *  Real deployments should also wire in a semantic/embedding similarity port — see
 *  SimilarityValidator's `semanticSimilarityPort` extension point — this hash is the
 *  zero-dependency floor, not the ceiling. */
export function structuralSignature(input: {
  primarySkill?: string;
  computationKind?: string;
  optionCount: number;
}): string {
  return `${input.primarySkill ?? 'UNKNOWN'}::${input.computationKind ?? 'NONE'}::${input.optionCount}`;
}
