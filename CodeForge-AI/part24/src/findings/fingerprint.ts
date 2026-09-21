import { createHash } from 'crypto';

/**
 * Stable identity for a finding: a hash of its category + enclosing location
 * + normalized code content. Two findings with the same fingerprint are
 * treated as the same underlying issue even if line numbers shift.
 */
export function computeFingerprint(category: string, snippet: string, file?: string): string {
  const normalized = snippet
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ');
  return createHash('sha256').update(`${category}::${file ?? ''}::${normalized}`).digest('hex').slice(0, 16);
}

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
}

/**
 * Token-overlap similarity used to re-identify a finding's code across
 * revisions: |intersection| / min(|A|, |B|), not a strict Jaccard index.
 * A finding's stored snippet is tight (just the flagged lines), while the
 * region it's matched against is a diff hunk padded with surrounding
 * context — dividing by the union would unfairly punish that padding even
 * when the flagged content is fully present. Dividing by the smaller set
 * asks the right question instead: "is A's content contained in B?"
 */
export function contentSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersectionSize = [...ta].filter((t) => tb.has(t)).length;
  return intersectionSize / Math.min(ta.size, tb.size);
}
