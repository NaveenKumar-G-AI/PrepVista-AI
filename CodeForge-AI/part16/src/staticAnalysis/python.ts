import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SupportedLanguage } from "../domain/enums.js";
import type { StaticFinding } from "../domain/types.js";
import type { StaticAnalyzer } from "./types.js";

/**
 * This is a real Python AST walk executed by the real CPython interpreter
 * (via `python3 -c`), not a JS re-implementation of Python's grammar.
 * Syntax errors reported here are the exact SyntaxError CPython itself
 * would raise before running the program.
 */
const PY_HELPER = String.raw`
import ast, json, sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8", errors="replace") as f:
    src = f.read()

findings = []

try:
    tree = ast.parse(src, filename=path)
except SyntaxError as e:
    findings.append({
        "ruleId": "py-syntax-error",
        "message": f"SyntaxError: {e.msg}",
        "severity": "error",
        "source": "ast-analysis",
        "range": {
            "startLine": e.lineno or 1,
            "endLine": e.lineno or 1,
            "startCol": (e.offset or 1) - 1,
            "endCol": (e.offset or 1),
        },
    })
    print(json.dumps(findings))
    sys.exit(0)

MUTABLE_DEFAULT_TYPES = (ast.List, ast.Dict, ast.Set)

for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        defaults = list(node.args.defaults) + [d for d in node.args.kw_defaults if d is not None]
        for d in defaults:
            if isinstance(d, MUTABLE_DEFAULT_TYPES):
                findings.append({
                    "ruleId": "py-mutable-default-arg",
                    "message": f"Function '{node.name}' uses a mutable default argument, which is shared across calls and can cause state to leak between invocations.",
                    "severity": "warning",
                    "source": "ast-analysis",
                    "range": {"startLine": node.lineno, "endLine": node.lineno},
                })

        # Heuristic: direct self-recursion with no conditional return before the recursive call.
        has_conditional_return_before_recursive_call = False
        has_recursive_call = False
        for i, stmt in enumerate(ast.walk(node)):
            if isinstance(stmt, ast.Call) and isinstance(stmt.func, ast.Name) and stmt.func.id == node.name:
                has_recursive_call = True
        if has_recursive_call:
            for stmt in node.body:
                if isinstance(stmt, ast.If):
                    for sub in ast.walk(stmt):
                        if isinstance(sub, ast.Return):
                            has_conditional_return_before_recursive_call = True
            if not has_conditional_return_before_recursive_call:
                findings.append({
                    "ruleId": "py-recursion-missing-base-case-heuristic",
                    "message": f"Function '{node.name}' calls itself but no conditional 'return' was found in its top-level body. Verify a base case exists and is reachable.",
                    "severity": "warning",
                    "source": "heuristic",
                    "range": {"startLine": node.lineno, "endLine": node.lineno},
                })

    if isinstance(node, ast.ExceptHandler) and node.type is None:
        findings.append({
            "ruleId": "py-bare-except",
            "message": "Bare 'except:' catches all exceptions including KeyboardInterrupt/SystemExit and can hide real bugs.",
            "severity": "warning",
            "source": "ast-analysis",
            "range": {"startLine": node.lineno, "endLine": node.lineno},
        })

    if isinstance(node, ast.Compare):
        for op, comparator in zip(node.ops, node.comparators):
            is_none = isinstance(comparator, ast.Constant) and comparator.value is None
            if is_none and isinstance(op, (ast.Eq, ast.NotEq)):
                findings.append({
                    "ruleId": "py-eq-none",
                    "message": "Comparison with None using '==' / '!=' found; 'is' / 'is not' is the correct idiom and matters for custom __eq__ types.",
                    "severity": "info",
                    "source": "ast-analysis",
                    "range": {"startLine": node.lineno, "endLine": node.lineno},
                })

print(json.dumps(findings))
`;

export class PythonStaticAnalyzer implements StaticAnalyzer {
  availability: "available" | "unavailable" = "unavailable";
  reasonUnavailable?: string;

  constructor(private readonly python3Path = "python3") {
    const check = spawnSync(this.python3Path, ["--version"]);
    if (check.status === 0) {
      this.availability = "available";
    } else {
      this.reasonUnavailable = "python3 interpreter not found on PATH";
    }
  }

  async analyze(sourceCode: string, filename: string): Promise<StaticFinding[]> {
    if (this.availability === "unavailable") return [];

    const dir = mkdtempSync(path.join(tmpdir(), "cf-py-"));
    const helperPath = path.join(dir, "_helper.py");
    const srcPath = path.join(dir, filename.endsWith(".py") ? filename : "submission.py");
    try {
      writeFileSync(helperPath, PY_HELPER, "utf-8");
      writeFileSync(srcPath, sourceCode, "utf-8");
      const result = spawnSync(this.python3Path, [helperPath, srcPath], { encoding: "utf-8", timeout: 5000 });
      if (result.status !== 0 || !result.stdout) return [];
      const raw = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
      return raw.map((f) => ({
        ruleId: String(f.ruleId),
        language: SupportedLanguage.PYTHON,
        message: String(f.message),
        severity: f.severity as StaticFinding["severity"],
        source: f.source as StaticFinding["source"],
        range: f.range as StaticFinding["range"],
      }));
    } catch {
      return [];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
