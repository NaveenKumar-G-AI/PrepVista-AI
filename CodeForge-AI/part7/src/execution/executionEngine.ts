import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { EXECUTION_LIMITS } from '../config/readinessConfig';
import { SupportedLanguage } from '../types';

export interface TestCase {
  input: string;
  expected_output: string;
}

export interface TestRunResult {
  test_index: number;
  passed: boolean;
  expected_output: string;
  actual_output: string;
  stderr: string;
  runtime_ms: number;
  timed_out: boolean;
}

export interface ExecutionSummary {
  status: 'passed' | 'failed' | 'runtime_error' | 'timeout' | 'compile_error';
  tests_passed: number;
  tests_total: number;
  runtime_ms: number;
  results: TestRunResult[];
  compile_stderr?: string;
}

interface RawRunOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

interface PreparedProgram {
  /** argv to execute the program once per test case (already includes the interpreter/binary). */
  runCommand: string[];
  cleanup: () => void;
  compileError?: string;
}

function runRaw(cmd: string, args: string[], stdin: string, timeoutMs: number, cwd?: string): Promise<RawRunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // A submission that never reads stdin (several of the deliberately
    // "broken" reference solutions do exactly this) can exit before our
    // write() finishes, producing an EPIPE on the stdin stream. That's an
    // expected, benign outcome here — we still want whatever stdout/stderr/
    // exit code the process produced — so it's swallowed on the stream
    // itself rather than being allowed to surface as an unhandled 'error'
    // event and crash the whole grading process.
    child.stdin.on('error', () => {});

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      if (stdout.length < EXECUTION_LIMITS.maxOutputBytes) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < EXECUTION_LIMITS.maxOutputBytes) stderr += d.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += String(err);
      resolve({ stdout, stderr, exitCode: 1, timedOut });
    });

    try {
      child.stdin.write(stdin);
      child.stdin.end();
    } catch {
      // same EPIPE race as above, caught here too for the synchronous path
    }
  });
}

/**
 * Writes the submission to disk and, for compiled languages, compiles it
 * ONCE — the resulting binary/class is then reused across every hidden
 * test case AND the complexity probe (see measureComplexity below), rather
 * than recompiling per test. A compile failure is reported as-is (real
 * javac/g++ stderr), never silently swallowed.
 */
async function prepareProgram(language: SupportedLanguage, code: string): Promise<PreparedProgram> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-exec-'));
  const cleanup = () => fs.rmSync(workDir, { recursive: true, force: true });

  if (language === 'python') {
    const file = path.join(workDir, `sol_${randomUUID()}.py`);
    fs.writeFileSync(file, code, 'utf8');
    return { runCommand: ['python3', file], cleanup };
  }
  if (language === 'javascript') {
    const file = path.join(workDir, `sol_${randomUUID()}.js`);
    fs.writeFileSync(file, code, 'utf8');
    return { runCommand: ['node', file], cleanup };
  }
  if (language === 'java') {
    // javac requires the public class name to match the filename exactly.
    const file = path.join(workDir, 'Solution.java');
    fs.writeFileSync(file, code, 'utf8');
    const compile = await runRaw('javac', [file], '', EXECUTION_LIMITS.compileTimeoutMs, workDir);
    if (compile.exitCode !== 0) return { runCommand: [], cleanup, compileError: compile.stderr.slice(0, 4000) };
    return { runCommand: ['java', '-cp', workDir, 'Solution'], cleanup };
  }
  if (language === 'cpp') {
    const file = path.join(workDir, 'solution.cpp');
    const bin = path.join(workDir, 'solution');
    fs.writeFileSync(file, code, 'utf8');
    const compile = await runRaw('g++', ['-O2', '-std=c++17', '-o', bin, file], '', EXECUTION_LIMITS.compileTimeoutMs, workDir);
    if (compile.exitCode !== 0) return { runCommand: [], cleanup, compileError: compile.stderr.slice(0, 4000) };
    return { runCommand: [bin], cleanup };
  }
  cleanup();
  throw new Error(`Unsupported language: ${language}`);
}

/**
 * Runs `code` once per test case, feeding `input` on stdin and comparing
 * trimmed stdout to `expected_output`. REAL execution — nothing here is
 * fabricated or LLM-guessed (sections 22, 25). Now supports Python,
 * JavaScript, Java, and C++ (compiled once, reused across all test cases).
 *
 * Honest isolation caveat: this is timeout + output-cap sandboxing on a
 * plain subprocess, not a container/VM — no network namespace isolation, no
 * filesystem jail, no cgroup memory ceiling. That's enough to grade
 * correctness for trusted/classroom use, but is NOT hardened enough for
 * hostile, fully-untrusted multi-tenant production traffic. Per section 2's
 * explicit instruction not to build a second execution engine, production
 * CodeForge should keep using its existing Docker-based sandbox and swap
 * that in behind this same runSubmission() signature.
 */
export async function runSubmission(
  language: SupportedLanguage,
  code: string,
  testCases: TestCase[]
): Promise<ExecutionSummary> {
  const prepared = await prepareProgram(language, code);
  try {
    if (prepared.compileError) {
      return {
        status: 'compile_error',
        tests_passed: 0,
        tests_total: testCases.length,
        runtime_ms: 0,
        compile_stderr: prepared.compileError,
        results: testCases.map((tc, i) => ({
          test_index: i,
          passed: false,
          expected_output: tc.expected_output.trim(),
          actual_output: '',
          stderr: prepared.compileError!.slice(0, 2000),
          runtime_ms: 0,
          timed_out: false,
        })),
      };
    }

    const [cmd, ...args] = prepared.runCommand;
    const results: TestRunResult[] = [];
    let totalRuntime = 0;
    let anyRuntimeError = false;
    let anyTimeout = false;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const start = Date.now();
      const outcome = await runRaw(cmd, args, tc.input, EXECUTION_LIMITS.timeoutMs);
      const runtimeMs = Date.now() - start;
      totalRuntime += runtimeMs;

      const actual = outcome.stdout.trim();
      const expected = tc.expected_output.trim();
      const passed = !outcome.timedOut && outcome.exitCode === 0 && actual === expected;

      if (outcome.timedOut) anyTimeout = true;
      else if (outcome.exitCode !== 0) anyRuntimeError = true;

      results.push({
        test_index: i,
        passed,
        expected_output: expected,
        actual_output: actual.slice(0, 2000),
        stderr: outcome.stderr.slice(0, 2000),
        runtime_ms: runtimeMs,
        timed_out: outcome.timedOut,
      });
    }

    const testsPassed = results.filter((r) => r.passed).length;
    let status: ExecutionSummary['status'];
    if (anyTimeout) status = 'timeout';
    else if (testsPassed === testCases.length && testCases.length > 0) status = 'passed';
    else if (anyRuntimeError && testsPassed === 0) status = 'runtime_error';
    else status = 'failed';

    return { status, tests_passed: testsPassed, tests_total: testCases.length, runtime_ms: totalRuntime, results };
  } finally {
    prepared.cleanup();
  }
}

export interface ComplexityProbe {
  small_input: string;
  large_input: string;
  /** how many "units" larger the large_input problem is, e.g. n=32 vs n=20 -> use whatever ratio is meaningful for the algorithm (here, linear in n) */
  input_size_ratio: number;
  /** runtime may grow at most this many times faster than input_size_ratio before being penalized */
  max_acceptable_runtime_ratio: number;
}

export interface ComplexityMeasurement {
  small_ms: number;
  large_ms: number;
  runtime_ratio: number;
  score: number; // 0..1
  note: string;
}

/**
 * Empirically measures how a submission's runtime scales, by actually
 * running it against a small and a large input and comparing wall-clock
 * time — real measurement, not static analysis or a guess (section 39:
 * "use actual code and challenge evidence where possible. Do not rely
 * entirely on AI-generated subjective scoring" — this relies on neither AI
 * NOR a subjective read of the source; it's a timed experiment).
 * Compiles once (for compiled languages) and reuses that artifact for both
 * runs, same as runSubmission.
 */
export async function measureComplexity(
  language: SupportedLanguage,
  code: string,
  probe: ComplexityProbe
): Promise<ComplexityMeasurement> {
  const prepared = await prepareProgram(language, code);
  try {
    if (prepared.compileError) {
      return { small_ms: 0, large_ms: 0, runtime_ratio: 0, score: 0, note: 'Could not measure — submission did not compile.' };
    }
    const [cmd, ...args] = prepared.runCommand;

    const t0 = Date.now();
    const small = await runRaw(cmd, args, probe.small_input, EXECUTION_LIMITS.timeoutMs);
    const smallMs = Math.max(1, Date.now() - t0);

    const t1 = Date.now();
    const large = await runRaw(cmd, args, probe.large_input, EXECUTION_LIMITS.timeoutMs);
    const largeMs = Math.max(1, Date.now() - t1);

    if (large.timedOut) {
      return {
        small_ms: smallMs,
        large_ms: EXECUTION_LIMITS.timeoutMs,
        runtime_ratio: Infinity,
        score: 0,
        note: 'Timed out on the larger input — growth rate looks at least exponential within the time budget.',
      };
    }

    const runtimeRatio = largeMs / smallMs;
    const overshoot = Math.max(0, runtimeRatio / probe.max_acceptable_runtime_ratio - 1);
    const score = Math.max(0, Math.min(1, 1 - overshoot * 0.5));
    const note =
      score >= 0.8
        ? `Runtime grew ${runtimeRatio.toFixed(1)}x for a ${probe.input_size_ratio}x larger input — consistent with an efficient (near-linear/log) approach.`
        : `Runtime grew ${runtimeRatio.toFixed(1)}x for a ${probe.input_size_ratio}x larger input — consistent with a less efficient approach (e.g. exponential recursion without memoization).`;

    return { small_ms: smallMs, large_ms: largeMs, runtime_ratio: runtimeRatio, score, note };
  } finally {
    prepared.cleanup();
  }
}
