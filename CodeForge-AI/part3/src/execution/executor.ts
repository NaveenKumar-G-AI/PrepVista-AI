/**
 * CodeForge — Execution Engine (§21, §23, §24)
 *
 * Runs student-submitted code against a single test case's positional
 * arguments and reports what actually happened — never a guess. This module
 * is the only place in the codebase that shells out to run untrusted code.
 *
 * Isolation in THIS prototype: each call gets its own subprocess and its own
 * throwaway temp directory, with CPU-time, wall-clock, and (for Python)
 * virtual-memory limits enforced by the OS. That is real resource-limiting,
 * verified empirically against this sandbox (see docs/IMPLEMENTATION_MANIFEST.md
 * for the exact ulimit/timeout behavior observed). It is NOT the filesystem/
 * network/multi-tenant isolation a real deployment needs — see
 * docs/CODEFORGE_CHALLENGE_SECURITY.md — production should run this behind a
 * real per-execution container (Docker/gVisor/Firecracker), reachable through
 * the same CodeExecutor interface so nothing above this layer has to change.
 *
 * Node.js note: `ulimit -v` reliably crashes the Node process itself (V8
 * reserves a large virtual address range at startup independent of actual
 * heap usage), so JS memory is bounded with `--max-old-space-size` instead —
 * this was verified directly, not assumed.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExecutionStatus, SupportedLanguage, type TestCase, type TestResult } from "../domain/types.js";
import { deepEqual } from "./deepEqual.js";

export interface ExecutionLimits {
  wallTimeMs: number;
  cpuTimeSec: number;
  /** Python only — see module note above for why Node uses heapMB instead. */
  memoryKB: number;
  /** Node only. */
  heapMB: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  wallTimeMs: 5000,
  cpuTimeSec: 4,
  memoryKB: 262144, // 256 MB
  heapMB: 128,
};

interface HarnessOutcome {
  ok: boolean;
  status: ExecutionStatus;
  actualOutput?: unknown;
  compileError: string | null;
  runtimeError: string | null;
  resourceLimitExceeded: boolean;
  rawStderr: string;
  wallTimeMs: number;
}

const PYTHON_HARNESS = `
import sys, json, importlib.util

spec = importlib.util.spec_from_file_location("solution", "solution.py")
mod = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(mod)
except Exception as e:
    print(json.dumps({"__harness_error__": "compile_error", "message": f"{type(e).__name__}: {e}"}))
    sys.exit(1)

entry = sys.argv[1]
fn = getattr(mod, entry, None)
if fn is None or not callable(fn):
    print(json.dumps({"__harness_error__": "missing_function", "message": f"no callable '{entry}' defined"}))
    sys.exit(1)

with open("args.json") as f:
    args = json.load(f)

try:
    result = fn(*args)
    print(json.dumps({"__harness_result__": result}))
except Exception as e:
    print(json.dumps({"__harness_error__": "runtime_error", "message": f"{type(e).__name__}: {e}"}))
    sys.exit(1)
`.trim();

const NODE_HARNESS = `
import { readFileSync } from "node:fs";

const entry = process.argv[2];

async function main() {
  let mod;
  try {
    mod = await import("./solution.mjs");
  } catch (e) {
    console.log(JSON.stringify({ __harness_error__: "compile_error", message: String((e && e.message) || e) }));
    process.exit(1);
  }
  const fn = mod[entry];
  if (typeof fn !== "function") {
    console.log(JSON.stringify({ __harness_error__: "missing_function", message: \`no export '\${entry}' defined\` }));
    process.exit(1);
  }
  const args = JSON.parse(readFileSync("args.json", "utf8"));
  try {
    const result = await fn(...args);
    console.log(JSON.stringify({ __harness_result__: result === undefined ? null : result }));
  } catch (e) {
    const name = (e && e.constructor && e.constructor.name) || "Error";
    console.log(JSON.stringify({ __harness_error__: "runtime_error", message: \`\${name}: \${(e && e.message) || e}\` }));
    process.exit(1);
  }
}
main();
`.trim();

function runSubprocess(
  language: SupportedLanguage,
  code: string,
  entryFunction: string,
  args: unknown[],
  limits: ExecutionLimits,
): HarnessOutcome {
  const dir = mkdtempSync(path.join(tmpdir(), "codeforge-exec-"));
  const start = Date.now();
  try {
    writeFileSync(path.join(dir, "args.json"), JSON.stringify(args));

    let command: string;
    if (language === SupportedLanguage.PYTHON) {
      writeFileSync(path.join(dir, "solution.py"), code);
      writeFileSync(path.join(dir, "harness.py"), PYTHON_HARNESS);
      command = `ulimit -v ${limits.memoryKB}; ulimit -t ${limits.cpuTimeSec}; exec python3 harness.py "${entryFunction}"`;
    } else {
      writeFileSync(path.join(dir, "solution.mjs"), code);
      writeFileSync(path.join(dir, "harness.mjs"), NODE_HARNESS);
      command = `ulimit -t ${limits.cpuTimeSec}; exec node --max-old-space-size=${limits.heapMB} harness.mjs "${entryFunction}"`;
    }

    const res = spawnSync("bash", ["-c", command], {
      cwd: dir,
      timeout: limits.wallTimeMs,
      killSignal: "SIGKILL",
      encoding: "utf8",
      maxBuffer: 2_000_000,
    });
    const wallTimeMs = Date.now() - start;

    if (res.error) {
      return {
        ok: false,
        status: ExecutionStatus.SYSTEM_ERROR,
        compileError: null,
        runtimeError: `platform error launching subprocess: ${res.error.message}`,
        resourceLimitExceeded: false,
        rawStderr: "",
        wallTimeMs,
      };
    }

    // Killed by a signal (our wall-clock timeout, ulimit -t, or a Node heap abort).
    // We deliberately do NOT claim to know which one — see module docstring.
    if (res.signal) {
      return {
        ok: false,
        status: ExecutionStatus.FAILED,
        compileError: null,
        runtimeError: "execution stopped: exceeded the allotted time or memory",
        resourceLimitExceeded: true,
        rawStderr: (res.stderr ?? "").slice(0, 2000),
        wallTimeMs,
      };
    }

    const stdout = (res.stdout ?? "").trim();
    const lastLine = stdout.split("\n").filter(Boolean).pop() ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      // fall through — treated as a system error below
    }

    if (parsed && "__harness_result__" in parsed) {
      return {
        ok: true,
        status: ExecutionStatus.RUNNING,
        actualOutput: parsed.__harness_result__,
        compileError: null,
        runtimeError: null,
        resourceLimitExceeded: false,
        rawStderr: "",
        wallTimeMs,
      };
    }

    if (parsed && "__harness_error__" in parsed) {
      const kind = parsed.__harness_error__ as string;
      return {
        ok: false,
        status: ExecutionStatus.FAILED,
        compileError: kind === "compile_error" ? parsed.message : null,
        runtimeError: kind !== "compile_error" ? parsed.message : null,
        resourceLimitExceeded: false,
        rawStderr: (res.stderr ?? "").slice(0, 2000),
        wallTimeMs,
      };
    }

    // Non-zero exit / unparseable output the harness itself didn't explain.
    return {
      ok: false,
      status: ExecutionStatus.SYSTEM_ERROR,
      compileError: null,
      runtimeError: `unexpected process exit (code ${res.status}); stderr: ${(res.stderr ?? "").slice(0, 500)}`,
      resourceLimitExceeded: false,
      rawStderr: (res.stderr ?? "").slice(0, 2000),
      wallTimeMs,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs one test case and scores it against the expected output. Never throws. */
export function runTestCase(
  language: SupportedLanguage,
  code: string,
  entryFunction: string,
  comparisonMode: "exact" | "unordered_collection",
  testCase: TestCase,
  limits: ExecutionLimits = DEFAULT_LIMITS,
): { result: TestResult; outcome: HarnessOutcome } {
  const outcome = runSubprocess(language, code, entryFunction, testCase.input, limits);

  if (!outcome.ok) {
    const errorKind: TestResult["errorKind"] = outcome.resourceLimitExceeded
      ? "resource_limit"
      : outcome.compileError
        ? "compile_error"
        : outcome.status === ExecutionStatus.SYSTEM_ERROR
          ? "system_error"
          : "runtime_error";
    return {
      outcome,
      result: {
        testId: testCase.id,
        category: testCase.category,
        hidden: testCase.hidden,
        passed: false,
        expectedOutput: testCase.hidden ? undefined : testCase.expectedOutput,
        errorMessage: outcome.compileError ?? outcome.runtimeError ?? "execution failed",
        errorKind,
      },
    };
  }

  const passed = deepEqual(outcome.actualOutput, testCase.expectedOutput, comparisonMode);
  return {
    outcome,
    result: {
      testId: testCase.id,
      category: testCase.category,
      hidden: testCase.hidden,
      passed,
      // Hidden tests never expose actual/expected values (§18, §43) — only whether they passed.
      // A visible error message is still fine to keep: it describes the student's own code
      // behavior (e.g. "TypeError: ..."), not the hidden test's secret input or answer.
      actualOutput: testCase.hidden ? undefined : outcome.actualOutput,
      expectedOutput: testCase.hidden ? undefined : testCase.expectedOutput,
    },
  };
}
