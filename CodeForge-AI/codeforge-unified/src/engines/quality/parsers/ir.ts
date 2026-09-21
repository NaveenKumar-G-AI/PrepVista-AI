// ============================================================================
// Normalized AST (IR) — every language adapter converts its native AST into this
// shape, so structural analysis, duplication, and the rule engine are written
// ONCE and work across languages instead of being reimplemented per language.
// ============================================================================

export type NodeKind =
  | 'Program'
  | 'FunctionDecl'
  | 'ClassDecl'
  | 'Param'
  | 'Block'
  | 'If'
  | 'For'
  | 'While'
  | 'Try'
  | 'Catch'
  | 'With'
  | 'Return'
  | 'Throw'
  | 'Break'
  | 'Continue'
  | 'Call'
  | 'Assignment'
  | 'AugAssignment'
  | 'VariableDecl'
  | 'BinaryExpr'
  | 'BoolOp'
  | 'UnaryExpr'
  | 'Literal'
  | 'Identifier'
  | 'Import'
  | 'ImportName'
  | 'Comment'
  | 'ExpressionStmt';

export interface NormalizedNode {
  kind: NodeKind;
  name?: string;
  value?: string | number | boolean | null;
  operator?: string;
  children: NormalizedNode[];
  loc: { startLine: number; endLine: number; startCol?: number; endCol?: number };
  meta?: Record<string, unknown>;
}

export interface ParsedModule {
  language: 'python' | 'javascript' | 'typescript';
  root: NormalizedNode;
  comments: NormalizedNode[];
  sourceLines: string[];
}

/**
 * Depth-first walk. `visit` receives the node and its chain of ancestors (root-first).
 * `stopDescend`, if provided, is checked AFTER visiting a node — if true, its children
 * are skipped. Used so a function's own metrics don't silently absorb a nested
 * function's statements.
 */
export function walk(
  node: NormalizedNode,
  visit: (n: NormalizedNode, parents: NormalizedNode[]) => void,
  parents: NormalizedNode[] = [],
  stopDescend?: (n: NormalizedNode) => boolean
): void {
  visit(node, parents);
  if (stopDescend && stopDescend(node)) return;
  const nextParents = [...parents, node];
  for (const child of node.children) {
    walk(child, visit, nextParents, stopDescend);
  }
}

export function findAll(root: NormalizedNode, kind: NodeKind): NormalizedNode[] {
  const results: NormalizedNode[] = [];
  walk(root, (n) => {
    if (n.kind === kind) results.push(n);
  });
  return results;
}
