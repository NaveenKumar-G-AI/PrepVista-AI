import * as acorn from "acorn";
import * as walk from "acorn-walk";
import type { Result, SourceLocation } from "../types.js";

const LOOP_TYPES = new Set([
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "ForOfStatement",
  "ForInStatement",
]);

export interface LoopFact {
  type: string;
  /** 1 = top-level loop, 2 = nested one level deep, etc. */
  depth: number;
  location: SourceLocation;
}

export interface DataStructureUsage {
  kind: "Map" | "Set" | "Array" | "Object";
  variableName: string | null;
  location: SourceLocation;
  operations: string[];
}

export interface CallSite {
  raw: string; // e.g. "seen.has", "arr.sort", "twoSum"
  objectName: string | null;
  methodName: string | null;
  location: SourceLocation;
}

export interface FunctionFact {
  name: string | null;
  isRecursive: boolean;
  hasMemoizationSignal: boolean;
  paramCount: number;
  location: SourceLocation;
}

export interface AstFacts {
  maxLoopDepth: number;
  loops: LoopFact[];
  dataStructures: DataStructureUsage[];
  calls: CallSite[];
  functions: FunctionFact[];
  branchCount: number;
  hasEarlyReturn: boolean;
  /** Locations of guard-style checks against emptiness/null (best-effort). */
  emptyGuardLocations: SourceLocation[];
  sourceLines: number;
  /** Parsed AST root, kept for reuse by patternDetector.ts so it never has
   *  to re-parse the same source (see spec: "avoid reparsing source
   *  unnecessarily"). In-process use only — strip before persisting or
   *  sending this object over the wire. */
  ast: acorn.Node;
}

function loc(node: acorn.Node): SourceLocation {
  const l = (node as any).loc;
  if (!l) return { startLine: 0, endLine: 0 };
  return {
    startLine: l.start.line,
    endLine: l.end.line,
    startCol: l.start.column,
    endCol: l.end.column,
  };
}

function calleeToParts(callee: any): { raw: string; objectName: string | null; methodName: string | null } {
  if (callee.type === "Identifier") {
    return { raw: callee.name, objectName: null, methodName: callee.name };
  }
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    const objectName = callee.object.type === "Identifier" ? callee.object.name : null;
    const methodName = callee.property.name;
    return { raw: `${objectName ?? "?"}.${methodName}`, objectName, methodName };
  }
  return { raw: "?", objectName: null, methodName: null };
}

/** Structural heuristic for "is this test checking for emptiness/absence".
 *  Walks the actual AST shape (not source text) so it isn't thrown off by
 *  whitespace, parens, or unrelated fields on the node. Recognizes:
 *  X.length === 0, 0 === X.length, X.length < 1, X.length <= 0,
 *  X === null / X == null / X === undefined, !X, and && / || combinations
 *  of the above. */
function looksLikeEmptyGuard(node: any): boolean {
  if (!node || typeof node.type !== "string") return false;

  const isLengthAccess = (n: any) =>
    n?.type === "MemberExpression" &&
    !n.computed &&
    n.property?.type === "Identifier" &&
    n.property.name === "length";
  const isLiteral = (n: any, value: unknown) => n?.type === "Literal" && n.value === value;
  const isNullish = (n: any) =>
    (n?.type === "Literal" && n.value === null) || (n?.type === "Identifier" && n.name === "undefined");

  if (node.type === "BinaryExpression") {
    const { left, right, operator } = node;
    if (
      (operator === "===" || operator === "==") &&
      ((isLengthAccess(left) && isLiteral(right, 0)) || (isLiteral(left, 0) && isLengthAccess(right)))
    ) {
      return true;
    }
    if (operator === "<" && isLengthAccess(left) && isLiteral(right, 1)) return true;
    if (operator === "<=" && isLengthAccess(left) && isLiteral(right, 0)) return true;
    if ((operator === "===" || operator === "==") && (isNullish(left) || isNullish(right))) return true;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") return true;
  if (node.type === "LogicalExpression") {
    return looksLikeEmptyGuard(node.left) || looksLikeEmptyGuard(node.right);
  }
  return false;
}

export function analyzeSource(sourceCode: string, language: "javascript" = "javascript"): Result<AstFacts> {
  if (language !== "javascript") {
    return { ok: false, reason: "UNSUPPORTED_LANGUAGE", message: `No AST analyzer registered for "${language}". See adapters/adapters.ts to plug in another language.` };
  }
  if (!sourceCode || !sourceCode.trim()) {
    return { ok: false, reason: "PARSER_FAILURE", message: "Source code is empty." };
  }

  let ast: acorn.Node;
  try {
    ast = acorn.parse(sourceCode, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (moduleErr) {
    try {
      ast = acorn.parse(sourceCode, { ecmaVersion: "latest", sourceType: "script", locations: true });
    } catch (scriptErr) {
      const message = scriptErr instanceof Error ? scriptErr.message : String(scriptErr);
      return { ok: false, reason: "PARSER_FAILURE", message: `Could not parse source as JavaScript: ${message}` };
    }
  }

  const loops: LoopFact[] = [];
  const dataStructures: DataStructureUsage[] = [];
  const calls: CallSite[] = [];
  const functions: FunctionFact[] = [];
  const emptyGuardLocations: SourceLocation[] = [];
  let branchCount = 0;
  let hasEarlyReturn = 0 as number | boolean;
  let maxLoopDepth = 0;

  // ── Depth-sensitive traversal: loop nesting, branch/early-return facts ──
  function walkDepthSensitive(node: any, loopDepth: number, insideIf: boolean) {
    if (!node || typeof node.type !== "string") return;

    if (LOOP_TYPES.has(node.type)) {
      const depth = loopDepth + 1;
      loops.push({ type: node.type, depth, location: loc(node) });
      if (depth > maxLoopDepth) maxLoopDepth = depth;
      walkChildren(node, depth, insideIf);
      return;
    }

    if (node.type === "IfStatement") {
      branchCount++;
      if (looksLikeEmptyGuard(node.test)) emptyGuardLocations.push(loc(node));
      walkDepthSensitive(node.consequent, loopDepth, true);
      if (node.alternate) walkDepthSensitive(node.alternate, loopDepth, true);
      return;
    }

    if (node.type === "ReturnStatement" && insideIf) {
      hasEarlyReturn = true;
    }

    walkChildren(node, loopDepth, insideIf);
  }

  function walkChildren(node: any, loopDepth: number, insideIf: boolean) {
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item.type === "string") walkDepthSensitive(item, loopDepth, insideIf);
        }
      } else if (value && typeof value.type === "string") {
        walkDepthSensitive(value, loopDepth, insideIf);
      }
    }
  }

  walkDepthSensitive(ast, 0, false);

  // ── Flat collection pass (order-insensitive facts) ──
  const dsVariables = new Map<string, DataStructureUsage>();

  walk.simple(ast, {
    VariableDeclarator(node: any) {
      const name = node.id?.type === "Identifier" ? node.id.name : null;
      if (!node.init) return;
      if (node.init.type === "NewExpression" && node.init.callee.type === "Identifier") {
        const ctor = node.init.callee.callee?.name ?? node.init.callee.name;
        if (ctor === "Map" || ctor === "Set") {
          const usage: DataStructureUsage = { kind: ctor, variableName: name, location: loc(node), operations: [] };
          dataStructures.push(usage);
          if (name) dsVariables.set(name, usage);
        }
      } else if (node.init.type === "ArrayExpression") {
        const usage: DataStructureUsage = { kind: "Array", variableName: name, location: loc(node), operations: [] };
        dataStructures.push(usage);
        if (name) dsVariables.set(name, usage);
      } else if (node.init.type === "ObjectExpression") {
        const usage: DataStructureUsage = { kind: "Object", variableName: name, location: loc(node), operations: [] };
        dataStructures.push(usage);
        if (name) dsVariables.set(name, usage);
      }
    },
    CallExpression(node: any) {
      const parts = calleeToParts(node.callee);
      calls.push({ ...parts, location: loc(node) });
      if (parts.objectName && parts.methodName) {
        const usage = dsVariables.get(parts.objectName);
        if (usage && !usage.operations.includes(parts.methodName)) {
          usage.operations.push(parts.methodName);
        }
      }
    },
    FunctionDeclaration(node: any) {
      recordFunction(node.id?.name ?? null, node);
    },
    FunctionExpression(node: any) {
      // Only tag if assigned to a name via a parent VariableDeclarator; acorn-walk's
      // simple walker does not give us the parent, so anonymous function expressions
      // are still recorded (name: null) — recursion detection just won't apply to them.
      recordFunction(null, node);
    },
  });

  function recordFunction(name: string | null, node: any) {
    let isRecursive = false;
    let hasMemoizationSignal = false;
    if (name) {
      walk.simple(node.body, {
        CallExpression(inner: any) {
          if (inner.callee.type === "Identifier" && inner.callee.name === name) {
            isRecursive = true;
          }
        },
      });
    }
    // Heuristic memoization signal: a Map/object identifier used with both a
    // read-style op (has/get) and a write-style op (set) inside this function.
    const readOps = new Set(["has", "get"]);
    const writeOps = new Set(["set"]);
    const localOps = new Map<string, Set<string>>();
    walk.simple(node.body, {
      CallExpression(inner: any) {
        const parts = calleeToParts(inner.callee);
        if (parts.objectName && parts.methodName) {
          if (!localOps.has(parts.objectName)) localOps.set(parts.objectName, new Set());
          localOps.get(parts.objectName)!.add(parts.methodName);
        }
      },
      AssignmentExpression(inner: any) {
        if (inner.left.type === "MemberExpression" && inner.left.computed && inner.left.object.type === "Identifier") {
          if (!localOps.has(inner.left.object.name)) localOps.set(inner.left.object.name, new Set());
          localOps.get(inner.left.object.name)!.add("set");
        }
      },
    });
    for (const ops of localOps.values()) {
      const hasRead = [...ops].some((o) => readOps.has(o));
      const hasWrite = [...ops].some((o) => writeOps.has(o));
      if (hasRead && hasWrite) hasMemoizationSignal = true;
    }
    functions.push({
      name,
      isRecursive,
      hasMemoizationSignal,
      paramCount: node.params?.length ?? 0,
      location: loc(node),
    });
  }

  return {
    ok: true,
    value: {
      maxLoopDepth,
      loops,
      dataStructures,
      calls,
      functions,
      branchCount,
      hasEarlyReturn: Boolean(hasEarlyReturn),
      emptyGuardLocations,
      sourceLines: sourceCode.split("\n").length,
      ast,
    },
  };
}
