function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string, b: string): number {
  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/** True if `newHint` overlaps enough with something already given that it would feel repeated. */
export function isRepeatHint(newHint: string, previousHints: string[], threshold = 0.55): boolean {
  return previousHints.some((prev) => jaccard(prev, newHint) >= threshold);
}
