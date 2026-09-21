import { NormalizedNode, walk } from '../parsers/ir';
import { THRESHOLDS } from '../config';

export interface MagicValueHit {
  value: string | number | boolean;
  kind: 'number' | 'string';
  loc: { startLine: number; endLine: number };
  occurrences: number;
}

const TRIVIAL_NUMBERS = new Set(THRESHOLDS.TRIVIAL_NUMBERS);
const TRIVIAL_STRINGS = new Set(THRESHOLDS.TRIVIAL_STRINGS);

export function detectMagicValues(root: NormalizedNode): MagicValueHit[] {
  const numberCounts = new Map<number, { count: number; loc: any }>();
  const stringCounts = new Map<string, { count: number; loc: any }>();

  walk(root, (node) => {
    if (node.kind !== 'Literal') return;
    const literalType = (node.meta as any)?.literalType;

    if (literalType === 'number' && typeof node.value === 'number') {
      if (TRIVIAL_NUMBERS.has(node.value) || !Number.isFinite(node.value)) return;
      const entry = numberCounts.get(node.value) || { count: 0, loc: node.loc };
      entry.count++;
      numberCounts.set(node.value, entry);
    } else if (literalType === 'string' && typeof node.value === 'string') {
      const v = node.value;
      if (TRIVIAL_STRINGS.has(v) || v.length === 0) return;
      // Only short, token-like strings ("active", "pending") are candidate magic strings.
      // Multi-word prose (error messages, log lines, docstrings) is excluded — those need
      // to read naturally and aren't the kind of literal a named constant would replace.
      if (v.trim().split(/\s+/).length > THRESHOLDS.MAGIC_STRING_MAX_WORDS) return;
      const entry = stringCounts.get(v) || { count: 0, loc: node.loc };
      entry.count++;
      stringCounts.set(v, entry);
    }
  });

  const hits: MagicValueHit[] = [];
  for (const [value, info] of numberCounts) hits.push({ value, kind: 'number', loc: info.loc, occurrences: info.count });
  for (const [value, info] of stringCounts) hits.push({ value, kind: 'string', loc: info.loc, occurrences: info.count });
  return hits;
}
