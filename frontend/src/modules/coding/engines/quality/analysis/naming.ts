import { NormalizedNode, walk } from '../parsers/ir';

export interface NamingIssue {
  name: string;
  reason: string;
  loc: { startLine: number; endLine: number };
}

const CONVENTIONAL_LOOP_VARS = new Set(['i', 'j', 'k', 'x', 'y', 'z', '_']);
const GENERIC_NAMES = new Set(['data', 'temp', 'tmp', 'foo', 'bar', 'val', 'value', 'obj', 'thing', 'stuff', 'test']);

export function detectNamingIssues(functions: { name: string; node: NormalizedNode }[]): NamingIssue[] {
  const issues: NamingIssue[] = [];

  for (const fn of functions) {
    if (fn.name && fn.name !== 'anonymous') {
      if (fn.name.length <= 2) {
        issues.push({ name: fn.name, reason: 'Function name is too short to communicate its responsibility.', loc: fn.node.loc });
      } else if (GENERIC_NAMES.has(fn.name.toLowerCase())) {
        issues.push({ name: fn.name, reason: 'Function name is generic and does not describe what it does.', loc: fn.node.loc });
      }
    }

    const params = fn.node.children.filter((c) => c.kind === 'Param');
    for (const p of params) {
      if (p.name && p.name.length === 1 && !CONVENTIONAL_LOOP_VARS.has(p.name)) {
        issues.push({ name: p.name, reason: 'Parameter name is a single character outside a conventional loop-index context.', loc: p.loc });
      }
    }

    const block = fn.node.children.find((c) => c.kind === 'Block');
    if (!block) continue;
    walk(block, (n, parents) => {
      if (n.kind !== 'Assignment' && n.kind !== 'VariableDecl') return;
      const name = n.name;
      if (!name || name.includes(',')) return;
      const inLoop = parents.some((p) => p.kind === 'For' || p.kind === 'While');
      if (name.length === 1 && !(CONVENTIONAL_LOOP_VARS.has(name) && inLoop)) {
        issues.push({ name, reason: 'Variable name is a single character outside a conventional loop context.', loc: n.loc });
      } else if (GENERIC_NAMES.has(name.toLowerCase())) {
        issues.push({ name, reason: 'Variable name is generic and does not communicate its purpose.', loc: n.loc });
      }
    });
  }

  return issues;
}
