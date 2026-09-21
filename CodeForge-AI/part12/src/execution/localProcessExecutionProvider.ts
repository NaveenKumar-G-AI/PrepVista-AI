/**
 * CodeForge AI — Submission System
 * =====================================================================================
 * DEV/TEST REFERENCE EXECUTION PROVIDER — NOT PRODUCTION-SECURE SANDBOXING.
 * =====================================================================================
 * This is what runs in THIS sandboxed evaluation environment (no Docker-in-Docker, no
 * privileged namespaces, no network to pull a real judge sandbox like isolate/Firecracker/
 * gVisor). It gives real process isolation-adjacent controls — a fresh temp working
 * directory per execution, `ulimit -v/-t` (virtual memory / CPU seconds), a wall-clock
 * timeout that SIGKILLs the entire process GROUP (not just the tracked PID — see
 * killProcessGroup below), and an output-size cap — but it does NOT provide kernel-level
 * sandboxing: no seccomp-bpf syscall filtering, no network namespace, no filesystem
 * jail/chroot, no cgroup-enforced hard memory ceiling. Two limitations were found by
 * actually testing malicious code against this, not assumed:
 *   1. `ulimit -u` (max user processes) does NOT constrain a fork bomb here, because
 *      this process runs as root (uid 0), and Linux's RLIMIT_NPROC has never applied to
 *      root. A real fork-bomb test against this sandbox created 18,000+ processes before
 *      being brought under control — see ENGINEERING_REPORT.md, "Malicious-code testing:
 *      what actually happened," for the full incident and the fix (process-group kill
 *      via `detached: true` + `process.kill(-pid, 'SIGKILL')`, since a single-PID kill
 *      only ever terminates the direct child, leaving every forked descendant orphaned
 *      and still running).
 *   2. Even after that fix, containment is bounded by wall-clock time, not prevented
 *      outright — a fork bomb still gets a short head start before the timeout fires.
 *      A production sandbox needs a cgroup `pids.max` controller or PID namespace
 *      isolation to cap process count outright; this dev provider does not have one.
 * A sufficiently determined adversarial program could still observe more of the host
 * than a production judge sandbox would allow.
 *
 * Do not point production traffic at this class. Implement ExecutionProvider against
 * CodeForge's real, existing secure sandbox and select it via EXECUTION_PROVIDER — see
 * ENGINEERING_REPORT.md, "Execution provider: what's real vs what's a dev stand-in."
 *
 * What IS real and verified here (not invented): CPU time and peak memory are read from
 * /proc/<pid>/stat and /proc/<pid>/status while the child runs — genuine Linux kernel
 * accounting, not an estimate. See tests/executionProvider.test.ts, which runs actual
 * Python/C/C++/Node programs through this and checks real compiler/runtime behavior:
 * accepted, wrong answer, compile error, runtime error, timeout, and memory-limit cases.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { sleep } from '../domain/asyncUtils.js';
import { resolveRuntime } from './languageRuntimes.js';
import { sanitizeCompilerOutput } from '../services/sanitize.js';
import type { CompileInput, CompileResult, ExecutionProvider, RunInput, RunResult } from './executionProvider.js';

const CLK_TCK = 100; // getconf CLK_TCK on this platform; see file header — Linux-standard value
const POLL_INTERVAL_MS = 15;

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Kills the child's entire process GROUP, not just the tracked PID. This matters
 * specifically for fork bombs: a program that calls fork() in a loop produces
 * descendants that inherit the same process group (unless they explicitly call
 * setpgid), so killing only the originally-spawned PID leaves every forked descendant
 * running, orphaned and undetected. `detached: true` at spawn time makes the child the
 * leader of a fresh process group; the negative PID here is the POSIX convention for
 * "signal every process in this group." See ENGINEERING_REPORT.md, "Malicious-code
 * testing: what actually happened" for the incident this fixes.
 */
function killProcessGroup(child: import('node:child_process').ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

async function writeFilesToWorkDir(workDir: string, files: { path: string; content: string }[]): Promise<void> {
  for (const f of files) {
    const target = pathResolve(join(workDir, f.path));
    if (!target.startsWith(pathResolve(workDir))) {
      // Defense in depth: validation.ts already rejects traversal paths before a
      // submission is ever created, but this layer never trusts that upstream check
      // alone for something as consequential as a filesystem write.
      throw new Error(`PATH_TRAVERSAL_BLOCKED: resolved path escapes the execution work directory: ${f.path}`);
    }
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, f.content, 'utf8');
  }
}

interface SpawnLimits {
  cwd: string;
  stdin: string;
  wallTimeoutMs: number;
  cpuTimeLimitSec: number;
  memoryLimitKb: number;
  processLimit: number;
  outputLimitBytes: number;
}

async function readPeakRssKb(pid: number): Promise<number | null> {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = /VmHWM:\s+(\d+)\s+kB/.exec(status);
    return match && match[1] ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null; // process already exited between the poll check and the read — expected, not an error
  }
}

async function readCpuTicks(pid: number): Promise<number | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const utime = Number.parseInt(afterComm[11] ?? '', 10);
    const stime = Number.parseInt(afterComm[12] ?? '', 10);
    if (Number.isNaN(utime) || Number.isNaN(stime)) return null;
    return utime + stime;
  } catch {
    return null;
  }
}

async function spawnWithLimits(cmd: string, args: string[], limits: SpawnLimits): Promise<RunResult> {
  const shellCommand = [
    `ulimit -t ${Math.max(1, limits.cpuTimeLimitSec)}`,
    `ulimit -v ${Math.max(1024, limits.memoryLimitKb)}`,
    // Kept as defense-in-depth for a non-root deployment (where RLIMIT_NPROC is
    // actually enforced) even though it is a no-op here — this process runs as root in
    // this sandbox, and ulimit -u has never applied to root on Linux. The real
    // containment mechanism for a fork bomb in THIS environment is the wall-clock
    // timeout below, which kills the entire process GROUP — see killProcessGroup and
    // the file header for the incident that made this distinction necessary.
    `ulimit -u ${Math.max(1, limits.processLimit)}`,
    `exec ${shellQuote(cmd)} ${args.map(shellQuote).join(' ')}`,
  ].join(' && ');

  const child = spawn('bash', ['-c', shellCommand], {
    cwd: limits.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    // Minimal environment — no Supabase/Groq/Gemini keys, no application secrets, no
    // worker credentials. Only what a subprocess legitimately needs to run at all.
    env: { PATH: '/usr/bin:/bin', HOME: limits.cwd, LANG: 'C.UTF-8' },
  });

  let stdout = '';
  let stderr = '';
  let outputTruncated = false;
  let timedOut = false;
  let killedForOutput = false;

  child.stdin?.write(limits.stdin);
  child.stdin?.end();

  child.stdout?.on('data', (chunk) => {
    if (Buffer.byteLength(stdout, 'utf8') < limits.outputLimitBytes) {
      stdout += chunk.toString('utf8');
    } else if (!killedForOutput) {
      killedForOutput = true;
      outputTruncated = true;
      killProcessGroup(child);
    }
  });
  child.stderr?.on('data', (chunk) => {
    if (Buffer.byteLength(stderr, 'utf8') < limits.outputLimitBytes) stderr += chunk.toString('utf8');
  });

  const start = Date.now();
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    killProcessGroup(child);
  }, limits.wallTimeoutMs);

  let stopPolling = false;
  let peakRssKb = 0;
  let lastCpuTicks = 0;
  const pollLoop = (async () => {
    while (!stopPolling) {
      const pid = child.pid;
      if (pid !== undefined) {
        const [rss, cpu] = await Promise.all([readPeakRssKb(pid), readCpuTicks(pid)]);
        if (rss !== null) peakRssKb = Math.max(peakRssKb, rss);
        if (cpu !== null) lastCpuTicks = Math.max(lastCpuTicks, cpu);
      }
      await sleep(POLL_INTERVAL_MS);
    }
  })();

  const exitInfo = await new Promise<{ code: number | null; signal: string | null }>((resolveExit) => {
    child.on('close', (code, signal) => resolveExit({ code, signal }));
    child.on('error', () => resolveExit({ code: null, signal: 'SPAWN_ERROR' }));
  });

  clearTimeout(timeoutHandle);
  stopPolling = true;
  await pollLoop;

  const wallMs = Date.now() - start;
  const cpuMs = Math.round((lastCpuTicks / CLK_TCK) * 1000);

  // ulimit -v exhaustion on Linux typically surfaces as the process being killed (SIGSEGV/
  // SIGKILL/SIGABRT) or a language runtime's own allocator raising an error with a
  // non-zero exit — we treat "hit the configured memory ceiling" as the signal, not a
  // guess: peakRssKb approaching the configured limit AND an abnormal exit together.
  // NOTE: `limits.memoryLimitKb` here may be a runtime-floor-adjusted ulimit -v value
  // (see run()'s ulimitVKb), not the student-facing declared limit — so for runtimes
  // with a floor override this heuristic is a diagnostic only. resultAggregation.ts
  // does its own authoritative comparison of the real measured memoryKb against the
  // ORIGINAL config.memoryLimitKb for the actual MLE verdict; this flag never is that
  // source of truth by itself.
  const outOfMemory = !timedOut && peakRssKb > 0 && peakRssKb >= limits.memoryLimitKb * 0.92 && (exitInfo.code !== 0 || exitInfo.signal !== null);

  return {
    exitCode: exitInfo.code,
    signal: exitInfo.signal,
    stdout,
    stderr,
    wallMs,
    cpuMs,
    memoryKb: peakRssKb,
    timedOut,
    outOfMemory,
    outputTruncated,
  };
}

export class LocalProcessExecutionProvider implements ExecutionProvider {
  readonly name = 'local-process';

  async compile(input: CompileInput): Promise<CompileResult> {
    const runtime = resolveRuntime(input.language, input.languageVersion);
    if (!runtime.needsCompile) {
      return { status: 'NOT_REQUIRED', sanitizedOutput: '', durationMs: 0 };
    }

    await writeFilesToWorkDir(input.workDir, input.files);
    const mainPath = join(input.workDir, input.mainPath);
    const outPath = join(input.workDir, 'cf_exec_artifact');
    const { cmd, args } = runtime.compileCommand!(mainPath, outPath);

    const start = Date.now();
    const result = await spawnWithLimits(cmd, args, {
      cwd: input.workDir,
      stdin: '',
      wallTimeoutMs: 15_000,
      cpuTimeLimitSec: 15,
      memoryLimitKb: 524_288,
      processLimit: 32,
      outputLimitBytes: 65_536,
    });
    const durationMs = Date.now() - start;

    if (result.timedOut) {
      return { status: 'FAILED', sanitizedOutput: sanitizeCompilerOutput('Compilation timed out.'), durationMs };
    }
    if (result.exitCode !== 0) {
      return { status: 'FAILED', sanitizedOutput: sanitizeCompilerOutput(result.stderr || result.stdout || 'Compilation failed.'), durationMs };
    }
    return { status: 'SUCCESS', sanitizedOutput: sanitizeCompilerOutput(result.stderr), durationMs, artifactPath: outPath };
  }

  async run(input: RunInput): Promise<RunResult> {
    const runtime = resolveRuntime(input.language, input.languageVersion);
    // Re-written even if compile() already wrote them: this is what makes "stored
    // source === executed source" true by construction rather than by convention —
    // run() never trusts that some earlier step's disk state is still what the
    // submission snapshot says it should be.
    await writeFilesToWorkDir(input.workDir, input.files);
    const mainPath = join(input.workDir, input.mainPath);
    const { cmd, args } = runtime.runCommand(mainPath, input.compileArtifactPath);

    if (!cmd) {
      throw new Error('RUN_COMMAND_MISSING_ARTIFACT: a compiled artifact path was required but not provided');
    }

    // The ulimit -v ceiling can legitimately be higher than the student-facing memory
    // limit (see LanguageRuntime.minimumVirtualMemoryFloorKb) — but MLE classification
    // must still compare real /proc-measured RSS against the ORIGINAL configured limit,
    // never against this floor-adjusted value. spawnWithLimits only receives the
    // adjusted ceiling for the shell command; the caller (resultAggregation.ts) always
    // reads input.config.memoryLimitKb for classification, not this local variable.
    const ulimitVKb = Math.max(input.config.memoryLimitKb, runtime.minimumVirtualMemoryFloorKb ?? 0);

    return spawnWithLimits(cmd, args, {
      cwd: input.workDir,
      stdin: input.stdin,
      wallTimeoutMs: input.config.wallTimeLimitMs,
      cpuTimeLimitSec: Math.max(1, Math.ceil(input.config.cpuTimeLimitMs / 1000)),
      memoryLimitKb: ulimitVKb,
      processLimit: input.config.processLimit,
      outputLimitBytes: input.config.outputLimitBytes,
    });
  }
}

/** Creates a fresh, isolated work directory under the OS temp dir for one execution. Caller is responsible for cleanup via cleanupWorkDir. */
export async function createIsolatedWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `cf-exec-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
