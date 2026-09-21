import * as acorn from 'acorn';
import { ancestor as walkAncestor } from 'acorn-walk';

/**
 * A genuine, AST-based heuristic — not a lookup table. It parses the source
 * with acorn and measures:
 *   - cyclomatic complexity (decision points)
 *   - maximum loop nesting depth (used as a Big-O growth-rate proxy)
 *
 * This is a REFERENCE implementation of the complexity-evidence contract
 * (see analysis/evidenceAdapter.ts). CodeForge's actual Feature 17 engine
 * (which may support many languages and more precise analysis) should be
 * wired in as the authoritative source in production; this heuristic exists
 * so Code Review Mode has real, working signal out of the box and so the
 * contract is demonstrably exercised in tests.
 *
 * Scope: parses JavaScript/JS-flavored TypeScript-without-type-annotations.
 * Code that fails to parse (other languages, or TS-specific syntax) returns
 * null — callers must treat that as "no signal", never as "zero complexity".
 */

export interface ComplexityAnalysis {
  cyclomatic: number;
  maxLoopNestingDepth: number;
  bigOEstimate: string;
}

const LOOP_TYPES = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement']);

export function bigOFromDepth(depth: number): string {
  if (depth <= 0) return 'O(1)';
  if (depth === 1) return 'O(n)';
  return `O(n^${depth})`;
}

export function analyzeComplexity(code: string): ComplexityAnalysis | null {
  let ast: acorn.Node;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', allowReturnOutsideFunction: true });
  } catch {
    return null;
  }

  let cyclomatic = 1;
  let maxDepth = 0;

  const bump = () => {
    cyclomatic++;
  };
  const trackLoopDepth = (_node: unknown, _state: unknown, ancestors: unknown[]) => {
    const depth = (ancestors as { type: string }[]).filter((a) => LOOP_TYPES.has(a.type)).length;
    if (depth > maxDepth) maxDepth = depth;
  };

  walkAncestor(ast as never, {
    IfStatement: bump,
    ConditionalExpression: bump,
    LogicalExpression: bump,
    CatchClause: bump,
    SwitchCase: bump,
    ForStatement: (node, state, ancestors) => {
      bump();
      trackLoopDepth(node, state, ancestors);
    },
    WhileStatement: (node, state, ancestors) => {
      bump();
      trackLoopDepth(node, state, ancestors);
    },
    DoWhileStatement: (node, state, ancestors) => {
      bump();
      trackLoopDepth(node, state, ancestors);
    },
    ForInStatement: (node, state, ancestors) => {
      bump();
      trackLoopDepth(node, state, ancestors);
    },
    ForOfStatement: (node, state, ancestors) => {
      bump();
      trackLoopDepth(node, state, ancestors);
    },
  });

  return { cyclomatic, maxLoopNestingDepth: maxDepth, bigOEstimate: bigOFromDepth(maxDepth) };
}
