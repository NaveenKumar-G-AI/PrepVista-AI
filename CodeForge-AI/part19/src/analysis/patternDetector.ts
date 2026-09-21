import * as walk from "acorn-walk";
import type { AstFacts } from "./astAnalyzer.js";
import type { EvidenceStrength, SourceLocation } from "../types.js";

export const CANONICAL_PATTERNS = [
  "hashing",
  "sliding-window",
  "binary-search",
  "bfs",
  "dfs",
  "sorting",
  "recursion",
  "recursion-memoized",
  "nested-iteration",
  "linear-scan",
] as const;
export type CanonicalPattern = (typeof CANONICAL_PATTERNS)[number];

export interface DetectedPattern {
  pattern: CanonicalPattern;
  confidence: EvidenceStrength;
  rationale: string;
  location: SourceLocation | null;
}

// ── Free-text → canonical pattern normalization ────────────────────────────
// Lets the verifier compare "I used a hashmap for O(1) lookup" against the
// canonical "hashing" pattern without requiring textbook vocabulary.
const SYNONYMS: Array<{ pattern: CanonicalPattern; test: RegExp }> = [
  { pattern: "hashing", test: /hash\s?-?(map|table|set)?|dictionary|\bmap\b.*lookup|constant[- ]time lookup/i },
  { pattern: "sliding-window", test: /sliding window|window (sum|approach)|two[- ]pointer/i },
  { pattern: "binary-search", test: /binary search|divide (the )?(search space|range)|halv(e|ing) the (range|search)/i },
  { pattern: "bfs", test: /\bbfs\b|breadth[- ]first/i },
  { pattern: "dfs", test: /\bdfs\b|depth[- ]first/i },
  { pattern: "sorting", test: /\bsort(ing)?\b/i },
  { pattern: "recursion-memoized", test: /memoiz|cache.*recursion|recursion.*cache|top[- ]down dp/i },
  { pattern: "recursion", test: /recursi(on|ve(ly)?)|divide and conquer|backtrack/i },
  { pattern: "nested-iteration", test: /nested loop|brute[- ]force|check(ing)? (every|each) pair|compare (every|each) pair/i },
  { pattern: "linear-scan", test: /linear scan|single pass|one pass|iterate (through|over) once/i },
];

export function normalizeAlgorithmClaim(text: string): CanonicalPattern | null {
  for (const { pattern, test } of SYNONYMS) {
    if (test.test(text)) return pattern;
  }
  return null;
}

// ── Structural detectors ────────────────────────────────────────────────

function collectIdentifierNames(node: any): string[] {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "BinaryExpression") {
    return [...collectIdentifierNames(node.left), ...collectIdentifierNames(node.right)];
  }
  return [];
}

/** Returns the two bound-variable names if `expr` computes a midpoint of the
 *  form Math.floor((a+b)/2), (a+b)>>1, or a + Math.floor((b-a)/2). */
function extractMidpointBounds(expr: any): string[] | null {
  if (!expr) return null;
  if (
    expr.type === "CallExpression" &&
    expr.callee?.type === "MemberExpression" &&
    expr.callee.object?.name === "Math" &&
    expr.callee.property?.name === "floor"
  ) {
    return extractMidpointBounds(expr.arguments[0]);
  }
  if (expr.type === "BinaryExpression" && (expr.operator === "/" || expr.operator === ">>")) {
    const divisorOk =
      (expr.operator === "/" && expr.right?.type === "Literal" && expr.right.value === 2) ||
      (expr.operator === ">>" && expr.right?.type === "Literal" && expr.right.value === 1);
    if (divisorOk && expr.left?.type === "BinaryExpression" && expr.left.operator === "+") {
      const ids = collectIdentifierNames(expr.left);
      if (ids.length === 2) return ids;
    }
  }
  if (expr.type === "BinaryExpression" && expr.operator === "+" && expr.left?.type === "Identifier") {
    const rhs = expr.right?.type === "CallExpression" ? expr.right.arguments[0] : expr.right;
    if (rhs?.type === "BinaryExpression" && rhs.operator === "/" && rhs.left?.type === "BinaryExpression" && rhs.left.operator === "-") {
      const ids = collectIdentifierNames(rhs.left);
      if (ids.length === 2 && ids.includes(expr.left.name)) return ids;
    }
  }
  return null;
}

function findBinarySearchShape(loopNode: any): { location: SourceLocation } | null {
  let bounds: string[] | null = null;
  walk.simple(loopNode, {
    VariableDeclarator(n: any) {
      if (bounds || n.id?.type !== "Identifier" || !n.init) return;
      bounds = extractMidpointBounds(n.init);
    },
    AssignmentExpression(n: any) {
      if (bounds || n.left?.type !== "Identifier") return;
      bounds = extractMidpointBounds(n.right);
    },
  });
  if (!bounds) return null;
  const boundSet = new Set(bounds);
  let reassignments = 0;
  walk.simple(loopNode, {
    AssignmentExpression(n: any) {
      if (n.operator === "=" && n.left?.type === "Identifier" && boundSet.has(n.left.name)) reassignments++;
    },
  });
  if (reassignments >= 2) return { location: locOf(loopNode) };
  return null;
}

function findSlidingWindowShape(loopNode: any): { location: SourceLocation } | null {
  const plusEqTargets = new Set<string>();
  const minusEqTargets = new Set<string>();
  walk.simple(loopNode, {
    AssignmentExpression(n: any) {
      if (n.left?.type !== "Identifier") return;
      if (n.operator === "+=") plusEqTargets.add(n.left.name);
      if (n.operator === "-=") minusEqTargets.add(n.left.name);
    },
  });
  for (const name of plusEqTargets) {
    if (minusEqTargets.has(name)) return { location: locOf(loopNode) };
  }
  return null;
}

function locOf(node: any): SourceLocation {
  const l = node.loc;
  if (!l) return { startLine: 0, endLine: 0 };
  return { startLine: l.start.line, endLine: l.end.line, startCol: l.start.column, endCol: l.end.column };
}

/** Detects patterns in priority order: the most specific structural shape
 *  wins, then broader fallbacks. Never emits a pattern with no supporting
 *  evidence — falls back to "linear-scan" / "nested-iteration" (still
 *  evidence-backed, just less specific) rather than guessing. */
export function detectPatterns(facts: AstFacts): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const ast = facts.ast as any;

  // Binary search — check each top-level loop for the midpoint-narrowing shape.
  walk.simple(ast, {
    WhileStatement(n: any) {
      const shape = findBinarySearchShape(n);
      if (shape) results.push({ pattern: "binary-search", confidence: "STRONG", rationale: "Loop computes a midpoint from two bounds and reassigns both bounds based on a comparison — the standard binary-search narrowing shape.", location: shape.location });
    },
    ForStatement(n: any) {
      const shape = findBinarySearchShape(n);
      if (shape) results.push({ pattern: "binary-search", confidence: "STRONG", rationale: "Loop computes a midpoint from two bounds and reassigns both bounds based on a comparison — the standard binary-search narrowing shape.", location: shape.location });
    },
  });

  // Hashing — Map/Set used with has/get/set/add inside any loop.
  const hashOps = new Set(["has", "get", "set", "add"]);
  for (const ds of facts.dataStructures) {
    if ((ds.kind === "Map" || ds.kind === "Set") && ds.operations.some((op) => hashOps.has(op)) && facts.loops.length > 0) {
      results.push({
        pattern: "hashing",
        confidence: "STRONG",
        rationale: `${ds.kind}${ds.variableName ? ` "${ds.variableName}"` : ""} is used with ${ds.operations.filter((o) => hashOps.has(o)).join("/")} inside a loop, giving amortized O(1) membership/lookup.`,
        location: ds.location,
      });
    }
  }

  // Sliding window — a running aggregate updated with += and -= in the same loop.
  walk.simple(ast, {
    ForStatement(n: any) {
      const shape = findSlidingWindowShape(n);
      if (shape) results.push({ pattern: "sliding-window", confidence: "MODERATE", rationale: "A variable is incremented and decremented (+=/-=) within the same loop — consistent with a running window aggregate.", location: shape.location });
    },
    WhileStatement(n: any) {
      const shape = findSlidingWindowShape(n);
      if (shape) results.push({ pattern: "sliding-window", confidence: "MODERATE", rationale: "A variable is incremented and decremented (+=/-=) within the same loop — consistent with a running window aggregate.", location: shape.location });
    },
  });

  // BFS — a variable used as both a queue-push and a queue-shift target.
  // DFS — a variable used as both a stack-push and a stack-pop target.
  const pushTargets = new Map<string, SourceLocation>();
  const shiftTargets = new Set<string>();
  const popTargets = new Set<string>();
  for (const call of facts.calls) {
    if (call.methodName === "push" && call.objectName) pushTargets.set(call.objectName, call.location);
    if (call.methodName === "shift" && call.objectName) shiftTargets.add(call.objectName);
    if (call.methodName === "pop" && call.objectName) popTargets.add(call.objectName);
  }
  for (const [name, location] of pushTargets) {
    if (shiftTargets.has(name)) {
      results.push({ pattern: "bfs", confidence: "STRONG", rationale: `"${name}" is used as a FIFO queue (push + shift), the standard BFS traversal shape.`, location });
    }
    if (popTargets.has(name)) {
      results.push({ pattern: "dfs", confidence: "MODERATE", rationale: `"${name}" is used as a LIFO stack (push + pop), consistent with an iterative DFS traversal.`, location });
    }
  }

  // Sorting — a .sort( call anywhere.
  const sortCall = facts.calls.find((c) => c.methodName === "sort");
  if (sortCall) {
    results.push({ pattern: "sorting", confidence: "DIRECT", rationale: "Calls the built-in .sort().", location: sortCall.location });
  }

  // Recursion / recursion-memoized — from function facts.
  for (const fn of facts.functions) {
    if (fn.isRecursive) {
      results.push({
        pattern: fn.hasMemoizationSignal ? "recursion-memoized" : "recursion",
        confidence: "DIRECT",
        rationale: fn.hasMemoizationSignal
          ? `Function "${fn.name}" calls itself and reads/writes a cache before recursing — memoized recursion.`
          : `Function "${fn.name}" calls itself with no cache detected.`,
        location: fn.location,
      });
    }
  }

  // Fallbacks — only added if nothing more specific was found, so the loop
  // structure is still represented by *something* evidence-backed.
  const specificPatterns = new Set(results.map((r) => r.pattern));
  const hasSpecific = [...specificPatterns].some((p) => p !== "nested-iteration" && p !== "linear-scan");
  if (!hasSpecific) {
    if (facts.maxLoopDepth >= 2) {
      const deepestLoop = facts.loops.find((l) => l.depth === facts.maxLoopDepth);
      results.push({
        pattern: "nested-iteration",
        confidence: "STRONG",
        rationale: `Loops are nested ${facts.maxLoopDepth} levels deep with no more specific pattern (hashing, sliding window, etc.) detected — consistent with brute-force / nested iteration.`,
        location: deepestLoop?.location ?? null,
      });
    } else if (facts.maxLoopDepth === 1) {
      results.push({
        pattern: "linear-scan",
        confidence: "MODERATE",
        rationale: "A single, non-nested loop with no more specific pattern detected.",
        location: facts.loops[0]?.location ?? null,
      });
    }
  }

  return results;
}
