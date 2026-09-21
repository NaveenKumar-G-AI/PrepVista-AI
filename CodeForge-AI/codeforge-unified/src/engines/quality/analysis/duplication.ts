import * as crypto from 'crypto';
import { NormalizedNode } from '../parsers/ir';
import { FunctionMetrics } from './structural';

export interface DuplicationMatch {
  kind: 'EXACT_STRUCTURAL' | 'NEAR_DUPLICATE';
  a: { name: string; loc: { startLine: number; endLine: number } };
  b: { name: string; loc: { startLine: number; endLine: number } };
  similarity: number;
  lineCount: number;
}

/** Structure-only signature: kind + operator at every node, identifier names and literal
 * values stripped out entirely. Two functions with identical control-flow shape hash
 * identically even if every variable was renamed and every literal changed. */
function structuralSignature(node: NormalizedNode): string {
  const parts: string[] = [];
  const rec = (n: NormalizedNode) => {
    parts.push(n.kind + (n.operator ? ':' + n.operator : ''));
    for (const c of n.children) rec(c);
  };
  rec(node);
  return parts.join('|');
}

function kindSequence(node: NormalizedNode): string[] {
  const seq: string[] = [];
  const rec = (n: NormalizedNode) => {
    seq.push(n.kind);
    for (const c of n.children) rec(c);
  };
  rec(node);
  return seq;
}

/** Jaccard similarity over 2-gram multisets of node kinds — cheap, deterministic, and
 * tolerant of minor structural differences (used for the "near duplicate" tier). */
function similarity(a: string[], b: string[]): number {
  const gramsOf = (seq: string[]) => {
    const g = new Map<string, number>();
    for (let i = 0; i < seq.length - 1; i++) {
      const key = seq[i] + '>' + seq[i + 1];
      g.set(key, (g.get(key) || 0) + 1);
    }
    return g;
  };
  const ga = gramsOf(a);
  const gb = gramsOf(b);
  const keys = new Set([...ga.keys(), ...gb.keys()]);
  let intersection = 0;
  let union = 0;
  for (const k of keys) {
    const va = ga.get(k) || 0;
    const vb = gb.get(k) || 0;
    intersection += Math.min(va, vb);
    union += Math.max(va, vb);
  }
  return union === 0 ? 0 : intersection / union;
}

export function detectDuplication(functions: FunctionMetrics[], minStatements: number, nearDupThreshold: number): DuplicationMatch[] {
  const matches: DuplicationMatch[] = [];
  const eligible = functions.filter((f) => f.statementCount >= minStatements);

  const sigMap = new Map<string, FunctionMetrics[]>();
  for (const f of eligible) {
    const block = f.node.children.find((c) => c.kind === 'Block');
    if (!block) continue;
    const sig = crypto.createHash('sha256').update(structuralSignature(block)).digest('hex');
    const arr = sigMap.get(sig) || [];
    arr.push(f);
    sigMap.set(sig, arr);
  }

  const exactPairKeys = new Set<string>();
  for (const arr of sigMap.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        matches.push({
          kind: 'EXACT_STRUCTURAL',
          a: { name: arr[i].name, loc: arr[i].loc },
          b: { name: arr[j].name, loc: arr[j].loc },
          similarity: 1,
          lineCount: Math.min(arr[i].lineCount, arr[j].lineCount),
        });
        exactPairKeys.add(`${arr[i].name}::${arr[j].name}`);
      }
    }
  }

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const key = `${eligible[i].name}::${eligible[j].name}`;
      if (exactPairKeys.has(key)) continue;
      const blockA = eligible[i].node.children.find((c) => c.kind === 'Block');
      const blockB = eligible[j].node.children.find((c) => c.kind === 'Block');
      if (!blockA || !blockB) continue;
      const sim = similarity(kindSequence(blockA), kindSequence(blockB));
      if (sim >= nearDupThreshold) {
        matches.push({
          kind: 'NEAR_DUPLICATE',
          a: { name: eligible[i].name, loc: eligible[i].loc },
          b: { name: eligible[j].name, loc: eligible[j].loc },
          similarity: sim,
          lineCount: Math.min(eligible[i].lineCount, eligible[j].lineCount),
        });
      }
    }
  }

  return matches;
}
