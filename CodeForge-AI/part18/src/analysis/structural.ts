import { NormalizedNode, walk, findAll } from '../parsers/ir';

export interface FunctionMetrics {
  node: NormalizedNode;
  name: string;
  loc: { startLine: number; endLine: number };
  lineCount: number;
  statementCount: number;
  paramCount: number;
  maxNestingDepth: number;
  cyclomaticComplexity: number;
  calledFunctionNames: string[];
}

const BRANCH_KINDS = new Set(['If', 'For', 'While', 'Catch']);
const NESTING_KINDS = new Set(['If', 'For', 'While', 'Try']);
const STATEMENT_KINDS = new Set([
  'If', 'For', 'While', 'Try', 'With', 'Return', 'Throw', 'Break', 'Continue',
  'Assignment', 'AugAssignment', 'VariableDecl', 'ExpressionStmt',
]);

export function extractFunctions(root: NormalizedNode): FunctionMetrics[] {
  return findAll(root, 'FunctionDecl').map(analyzeFunction);
}

function analyzeFunction(fn: NormalizedNode): FunctionMetrics {
  const params = fn.children.filter((c) => c.kind === 'Param');
  const block = fn.children.find((c) => c.kind === 'Block') || ({ kind: 'Block', children: [], loc: fn.loc } as NormalizedNode);

  let statementCount = 0;
  let maxDepth = 0;
  let cyclomatic = 1;
  const calledNames: string[] = [];

  // stopDescend on nested FunctionDecl: a helper function's own body shouldn't inflate the
  // metrics of the function that merely contains it — it gets counted separately via its
  // own findAll('FunctionDecl') entry.
  walk(
    block,
    (node, parents) => {
      if (STATEMENT_KINDS.has(node.kind)) statementCount++;
      if (node.kind === 'Call' && node.name) calledNames.push(node.name);
      if (BRANCH_KINDS.has(node.kind)) cyclomatic++;
      if (node.kind === 'BoolOp') cyclomatic += Math.max(0, node.children.length - 1);
      if (NESTING_KINDS.has(node.kind)) {
        const depth = parents.filter((p) => NESTING_KINDS.has(p.kind)).length + 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    },
    [],
    (n) => n.kind === 'FunctionDecl' && n !== block
  );

  return {
    node: fn,
    name: fn.name || 'anonymous',
    loc: { startLine: fn.loc.startLine, endLine: fn.loc.endLine },
    lineCount: Math.max(1, fn.loc.endLine - fn.loc.startLine + 1),
    statementCount,
    paramCount: params.length,
    maxNestingDepth: maxDepth,
    cyclomaticComplexity: cyclomatic,
    calledFunctionNames: Array.from(new Set(calledNames)),
  };
}

export interface DeadCodeHit {
  loc: { startLine: number; endLine: number };
  reason: string;
}

const TERMINAL_KINDS = new Set(['Return', 'Throw', 'Break', 'Continue']);

/** Purely structural fact: any statement after an unconditional return/throw/break/continue
 * in the SAME block can never execute. High confidence — no semantic guessing involved. */
export function detectUnreachableCode(root: NormalizedNode): DeadCodeHit[] {
  const hits: DeadCodeHit[] = [];
  walk(root, (node) => {
    if (node.kind !== 'Block') return;
    let terminated = false;
    for (const child of node.children) {
      if (terminated) {
        hits.push({ loc: child.loc, reason: 'Unreachable statement after a return/throw/break/continue in the same block.' });
        continue;
      }
      if (TERMINAL_KINDS.has(child.kind)) terminated = true;
    }
  });
  return hits;
}

export interface UnusedHit {
  name: string;
  loc: { startLine: number; endLine: number };
}

/** Whole-file check: an imported name that never appears as an Identifier anywhere else in
 * the file. Simple name-matching, not full module-graph analysis — documented as MEDIUM
 * confidence in the rule layer because re-exports or dynamic access could false-positive. */
export function detectUnusedImports(root: NormalizedNode): UnusedHit[] {
  const importNames: UnusedHit[] = [];
  for (const imp of findAll(root, 'Import')) {
    for (const child of imp.children) {
      if (child.kind === 'ImportName' && child.name) {
        const short = child.name.split('.').pop() || child.name;
        importNames.push({ name: short, loc: child.loc });
      }
    }
  }
  const allIdentifiers = new Set<string>();
  walk(root, (node) => {
    if (node.kind === 'Identifier' && node.name) allIdentifiers.add(node.name.split('.')[0]);
  });
  const seen = new Set<string>();
  const hits: UnusedHit[] = [];
  for (const { name, loc } of importNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!allIdentifiers.has(name)) hits.push({ name, loc });
  }
  return hits;
}

/** Per-function, single-scope check: a declared/assigned name that is never read again as an
 * Identifier within the same function body. Adapters never emit an Identifier for an
 * assignment's own LHS target, so any nonzero read count implies genuine use elsewhere. */
export function detectUnusedVariables(functions: FunctionMetrics[]): UnusedHit[] {
  const hits: UnusedHit[] = [];
  for (const fn of functions) {
    const block = fn.node.children.find((c) => c.kind === 'Block');
    if (!block) continue;

    const declared = new Map<string, { startLine: number; endLine: number }>();
    walk(block, (node) => {
      if ((node.kind === 'VariableDecl' || node.kind === 'Assignment') && node.name && !node.name.includes(',')) {
        if (!declared.has(node.name)) declared.set(node.name, node.loc);
      }
    });

    const reads = new Set<string>();
    walk(block, (node) => {
      if (node.kind === 'Identifier' && node.name) reads.add(node.name);
    });

    for (const [name, loc] of declared) {
      if (!reads.has(name)) hits.push({ name, loc });
    }
  }
  return hits;
}
