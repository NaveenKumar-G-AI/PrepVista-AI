import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Language, HarnessType } from '../types.js';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 5000;
const MAX_BUFFER = 2 * 1024 * 1024;

export interface RunnerTestCase {
  id: string;
  input: unknown;     // sandbox receives ONLY this — never `expected`
  category: string;
}

export interface RunnerResultRow {
  testCaseId: string;
  actual?: unknown;
  error?: string | null;
  timedOut: boolean;
  runtimeMs: number;
}

export interface RawExecutionOutcome {
  globalError: string | null;   // set when the submission fails to load at all (e.g. syntax error)
  timedOut: boolean;
  rows: RunnerResultRow[];
}

/**
 * Executes untrusted student code in a short-lived child process, isolated
 * from the main engine process, and returns raw per-test-case outputs.
 *
 * This module intentionally does NOT compare outputs to expected values —
 * see src/evaluation/evaluator.ts. Keeping comparison out of the sandbox
 * means expected values (including hidden-test answers) never have to be
 * transmitted into the untrusted process at all.
 *
 * Scope note: this uses a single child process per submission with one
 * overall timeout, which is adequate for the bounded, hand-authored problem
 * set in this reference build. It is explicitly NOT a hardened multi-tenant
 * sandbox (no seccomp/cgroups/microVM isolation) — a production CodeForge
 * execution engine should use a real isolation layer (e.g. Judge0-style
 * containers or Firecracker microVMs) for that. See CODEFORGE_FINAL_REPORT.md.
 */
export async function executeSubmission(opts: {
  language: Language;
  harnessType: HarnessType;
  functionName: string;
  code: string;
  testCases: RunnerTestCase[];
}): Promise<RawExecutionOutcome> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-exec-'));
  try {
    if (opts.language === 'javascript') {
      return await runJavaScript(dir, opts);
    }
    return await runPython(dir, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runJavaScript(
  dir: string,
  opts: { functionName: string; code: string; harnessType: HarnessType; testCases: RunnerTestCase[] },
): Promise<RawExecutionOutcome> {
  const solutionPath = path.join(dir, 'solution.mjs');
  const runnerPath = path.join(dir, 'run.mjs');
  const casesPath = path.join(dir, 'cases.json');

  await writeFile(solutionPath, `${opts.code}\nexport { ${opts.functionName} };\n`);
  await writeFile(casesPath, JSON.stringify(opts.testCases));

  const harness =
    opts.harnessType === 'stateful_ops'
      ? `
import { ${opts.functionName} } from './solution.mjs';
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync('./cases.json', 'utf-8'));
const results = [];
for (const c of cases) {
  const start = Date.now();
  try {
    const instance = new ${opts.functionName}();
    const returns = [];
    for (const step of c.input.ops) {
      let r;
      if (step.op === 'push') { instance.push(step.arg); r = null; }
      else if (step.op === 'pop') { r = instance.pop(); }
      else if (step.op === 'peek') { r = instance.peek(); }
      else if (step.op === 'isEmpty') { r = instance.isEmpty(); }
      returns.push(r === undefined ? null : r);
    }
    results.push({ testCaseId: c.id, actual: returns, error: null, runtimeMs: Date.now() - start });
  } catch (e) {
    results.push({ testCaseId: c.id, actual: null, error: String((e && e.message) || e), runtimeMs: Date.now() - start });
  }
}
process.stdout.write(JSON.stringify(results));
`
      : `
import { ${opts.functionName} } from './solution.mjs';
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync('./cases.json', 'utf-8'));
const results = [];
for (const c of cases) {
  const start = Date.now();
  try {
    const args = Array.isArray(c.input) ? c.input : [c.input];
    const actual = ${opts.functionName}(...args);
    results.push({ testCaseId: c.id, actual: actual === undefined ? null : actual, error: null, runtimeMs: Date.now() - start });
  } catch (e) {
    results.push({ testCaseId: c.id, actual: null, error: String((e && e.message) || e), runtimeMs: Date.now() - start });
  }
}
process.stdout.write(JSON.stringify(results));
`;
  await writeFile(runnerPath, harness);
  return runProcess('node', [runnerPath], dir, opts.testCases);
}

async function runPython(
  dir: string,
  opts: { functionName: string; code: string; testCases: RunnerTestCase[] },
): Promise<RawExecutionOutcome> {
  const solutionPath = path.join(dir, 'solution.py');
  const runnerPath = path.join(dir, 'run.py');
  const casesPath = path.join(dir, 'cases.json');

  await writeFile(solutionPath, opts.code);
  await writeFile(casesPath, JSON.stringify(opts.testCases));

  const harness = `
import json, time, traceback
import importlib.util

spec = importlib.util.spec_from_file_location("solution", "solution.py")
solution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(solution)
fn = getattr(solution, "${opts.functionName}")

with open("cases.json") as f:
    cases = json.load(f)

results = []
for c in cases:
    start = time.time()
    try:
        args = c["input"] if isinstance(c["input"], list) else [c["input"]]
        actual = fn(*args)
        results.append({"testCaseId": c["id"], "actual": actual, "error": None, "runtimeMs": int((time.time() - start) * 1000)})
    except Exception as e:
        results.append({"testCaseId": c["id"], "actual": None, "error": str(e), "runtimeMs": int((time.time() - start) * 1000)})

print(json.dumps(results))
`;
  await writeFile(runnerPath, harness);
  return runProcess('python3', [runnerPath], dir, opts.testCases);
}

async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  testCases: RunnerTestCase[],
): Promise<RawExecutionOutcome> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
    try {
      const parsed = JSON.parse(stdout) as RunnerResultRow[];
      return {
        globalError: null,
        timedOut: false,
        rows: parsed.map((r) => ({ ...r, timedOut: false })),
      };
    } catch {
      return { globalError: `Runner produced non-JSON output: ${stdout.slice(0, 500)}`, timedOut: false, rows: [] };
    }
  } catch (err: unknown) {
    const e = err as { killed?: boolean; signal?: string; stderr?: string; stdout?: string; code?: number };
    const timedOut = Boolean(e.killed && e.signal === 'SIGTERM');
    if (timedOut) {
      return {
        globalError: null,
        timedOut: true,
        rows: testCases.map((tc) => ({ testCaseId: tc.id, actual: null, error: 'Execution timed out', timedOut: true, runtimeMs: TIMEOUT_MS })),
      };
    }
    const stderr = (e.stderr || '').toString();
    return { globalError: stderr.slice(0, 800) || 'Unknown execution error', timedOut: false, rows: [] };
  }
}
