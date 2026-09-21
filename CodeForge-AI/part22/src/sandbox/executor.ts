/**
 * Sandboxed execution engine for Debugging Mode.
 *
 * SECURITY MODEL (read this before trusting it in production)
 * --------------------------------------------------------------------------
 * Every executed program runs as:
 *
 *   timeout -s KILL <wallClockSeconds>              <- hard wall-clock cutoff
 *     unshare --net --                               <- fresh, unrouted network namespace
 *       setpriv --reuid=nobody --regid=nogroup        <- drop from root to an unprivileged uid
 *               --clear-groups
 *         /bin/bash -c '
 *           ulimit -t <cpuSeconds>                    <- CPU-time cap
 *           ulimit -u <maxProcesses>                  <- fork-bomb defense
 *           ulimit -f <maxFileSizeKB>                 <- runaway file writes
 *           ulimit -v <memoryKB>                       <- address-space cap (Python only, see below)
 *           exec <interpreter> ...
 *         '
 *
 * This combination was empirically verified in this environment (not assumed)
 * against: an infinite loop, a memory-exhaustion loop, a fork bomb, a
 * filesystem read of a permission-protected file, and an outbound network
 * request. All five were contained. See tests/sandbox.test.ts.
 *
 * Two real, load-bearing gotchas discovered during that verification:
 *
 *  1. `ulimit -v` at a tight value (e.g. 256MB) crashes Node's own V8
 *     startup (V8 reserves a large virtual address space before running any
 *     user code), so the JavaScript runner does NOT use a tight `ulimit -v`.
 *     It relies on `--max-old-space-size` for the heap cap and a generous
 *     `ulimit -v` as a backstop against non-heap growth. Python has no such
 *     issue, so its `ulimit -v` is tight.
 *
 *  2. Node 20+'s `--experimental-permission` model can independently deny
 *     filesystem access outside the working directory and deny
 *     `child_process`/`worker_threads` entirely, *inside* the JS runtime -
 *     this is layered on top of (not instead of) the OS-level controls
 *     above, and was also verified directly (see tests/sandbox.test.ts).
 *
 * HONEST LIMITATION: this is process-level sandboxing (namespaces + rlimits
 * + privilege drop), not container/microVM-level isolation. It stops the
 * adversarial cases above, and it denies network + most filesystem access,
 * but it does not provide the same guarantee against kernel-level exploits
 * that gVisor, Firecracker, or Docker with a seccomp profile would. Python
 * in particular has no restricted-execution mode worth trusting (`-I`
 * isolated mode does not sandbox `os`/`socket`/`ctypes`). For a genuinely
 * multi-tenant production deployment, swap the `Executor` interface below
 * for a container/microVM-backed implementation (e.g. Firecracker, gVisor,
 * or a managed sandbox such as Judge0/Piston) - callers never need to
 * change, since they only depend on `Executor.run()`.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, chown, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../config.js";
import type { SupportedLanguage } from "../types.js";
import { buildTraceHarness, parseTraceFile, TRACE_ENTRY_FILE, TRACE_OUTPUT_FILE, type TraceEvent } from "./pythonTrace.js";

export interface ExecutionLimits {
  wallTimeMs: number;
  cpuTimeSec: number;
  memoryKB: number; // Python: hard ulimit -v. JS: ignored in favor of jsHeapMB + jsVirtualMemKB.
  jsHeapMB: number;
  jsVirtualMemKB: number;
  maxProcesses: number;
  maxFileSizeKB: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  wallTimeMs: config.sandbox.wallTimeMs,
  cpuTimeSec: config.sandbox.cpuTimeSec,
  memoryKB: config.sandbox.memoryKB,
  jsHeapMB: config.sandbox.jsHeapMB,
  jsVirtualMemKB: config.sandbox.jsVirtualMemKB,
  maxProcesses: config.sandbox.maxProcesses,
  maxFileSizeKB: config.sandbox.maxFileSizeKB
};

export interface ExecutionRequest {
  language: SupportedLanguage;
  code: string;
  stdin?: string;
  limits?: Partial<ExecutionLimits>;
  /** Python only (see RUNTIME_CAPABILITIES.structuredTrace). Ignored for other languages. */
  pythonTrace?: boolean;
}

export type KilledReason = "wall_time" | "cpu_time" | "memory" | "process_limit" | null;

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  killedReason: KilledReason;
  durationMs: number;
  truncatedOutput: boolean;
  /** Present only when pythonTrace was requested and the process lived long enough to flush it. */
  trace?: TraceEvent[];
  traceTruncated?: boolean;
}

export interface Executor {
  run(request: ExecutionRequest): Promise<ExecutionResult>;
}

const MAX_CAPTURED_OUTPUT_BYTES = 200_000; // defends against "oversized output" adversarial case
const ENTRY_FILE: Record<SupportedLanguage, string> = { python: "main.py", javascript: "main.js" };

/** Minimal, secret-free environment for the executed process. */
function minimalEnv(): NodeJS.ProcessEnv {
  return { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/tmp", LANG: "C.UTF-8" };
}

function buildInnerScript(
  language: SupportedLanguage,
  limits: ExecutionLimits,
  cwd: string,
  pythonEntryOverride?: string
): string {
  const common = [
    `cd ${shQuote(cwd)}`,
    `ulimit -t ${limits.cpuTimeSec}`,
    `ulimit -u ${limits.maxProcesses}`,
    `ulimit -f ${limits.maxFileSizeKB}`
  ];

  if (language === "python") {
    const entry = pythonEntryOverride ?? ENTRY_FILE.python;
    return [...common, `ulimit -v ${limits.memoryKB}`, `exec python3 -I -B ${entry} < ${ENTRY_FILE.python}.stdin`].join("\n");
  }

  // javascript: deliberately generous ulimit -v (see file header); real memory
  // control is --max-old-space-size plus the Node permission model.
  return [
    ...common,
    `ulimit -v ${limits.jsVirtualMemKB}`,
    `exec node --experimental-permission --allow-fs-read=${shQuote(cwd + "/*")} --allow-fs-write=${shQuote(
      cwd + "/*"
    )} --max-old-space-size=${limits.jsHeapMB} ${ENTRY_FILE.javascript} < ${ENTRY_FILE.javascript}.stdin`
  ].join("\n");
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Process-level sandbox executor. See file header for the exact security
 * model and its verified/known-unverified boundaries.
 */
export class ProcessSandboxExecutor implements Executor {
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const limits: ExecutionLimits = { ...DEFAULT_LIMITS, ...request.limits };
    const start = Date.now();
    const dir = await mkdtemp(path.join(tmpdir(), "cf-sbx-"));

    try {
      const entry = ENTRY_FILE[request.language];
      await writeFile(path.join(dir, entry), request.code, "utf8");
      await writeFile(path.join(dir, `${entry}.stdin`), request.stdin ?? "", "utf8");
      // nobody must own the dir/files to read+execute them after privilege drop.
      await chown(dir, 65534, 65534);
      await chown(path.join(dir, entry), 65534, 65534);
      await chown(path.join(dir, `${entry}.stdin`), 65534, 65534);

      let traceEntry: string | undefined;
      if (request.language === "python" && request.pythonTrace) {
        traceEntry = TRACE_ENTRY_FILE;
        await writeFile(path.join(dir, traceEntry), buildTraceHarness(entry), "utf8");
        await chown(path.join(dir, traceEntry), 65534, 65534);
      }

      const innerScript = buildInnerScript(request.language, limits, dir, traceEntry);
      const wallSeconds = Math.max(1, Math.ceil(limits.wallTimeMs / 1000));

      const args = [
        "-s",
        "KILL",
        String(wallSeconds),
        "unshare",
        "--net",
        "--",
        "setpriv",
        "--reuid=nobody",
        "--regid=nogroup",
        "--clear-groups",
        "/bin/bash",
        "-c",
        innerScript
      ];

      const result = await new Promise<ExecutionResult>((resolve) => {
        const child = spawn("timeout", args, { cwd: dir, env: minimalEnv() });
        let stdout = "";
        let stderr = "";
        let truncated = false;

        child.stdout.on("data", (chunk: Buffer) => {
          if (stdout.length < MAX_CAPTURED_OUTPUT_BYTES) stdout += chunk.toString("utf8");
          else truncated = true;
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < MAX_CAPTURED_OUTPUT_BYTES) stderr += chunk.toString("utf8");
          else truncated = true;
        });

        // Backstop in case `timeout` itself somehow doesn't fire.
        const backstop = setTimeout(() => {
          child.kill("SIGKILL");
        }, limits.wallTimeMs + 3000);

        child.on("close", (exitCode, signal) => {
          clearTimeout(backstop);
          const durationMs = Date.now() - start;
          // GNU `timeout` (without --foreground) puts itself and the monitored
          // command in one new process group and signals that whole group on
          // expiry - so `timeout` itself usually dies BY the signal (code=null,
          // signal='SIGKILL') rather than exiting cleanly with 128+signum. Both
          // shapes are treated as a timeout; this was confirmed empirically
          // (see tests/sandbox.test.ts) after an initial version of this
          // check only looked at exitCode and silently misclassified every
          // timeout as a plain, reason-less failure.
          const timedOut = exitCode === 137 || signal === "SIGKILL";
          resolve({
            stdout: truncateNote(stdout, truncated),
            stderr: truncateNote(stderr, truncated),
            exitCode,
            timedOut,
            killedReason: classifyKilledReason({ exitCode, stderr, timedOut }),
            durationMs,
            truncatedOutput: truncated
          });
        });
      });

      if (!traceEntry) return result;

      // Trace lives in the sandbox dir; read it back before cleanup runs.
      // If the process was killed before flushing it, there's nothing to
      // read - we omit the field rather than fabricate a trace.
      try {
        const raw = await readFile(path.join(dir, TRACE_OUTPUT_FILE), "utf8");
        const { events, truncated } = parseTraceFile(raw);
        return { ...result, trace: events, traceTruncated: truncated };
      } catch {
        return result;
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup; do not throw from a finally block */
      });
    }
  }
}

function truncateNote(s: string, truncated: boolean): string {
  return truncated ? s + "\n...[output truncated by sandbox]" : s;
}

/**
 * Best-effort, evidence-based classification of *why* a process died.
 * This never invents a reason it can't support from exitCode/stderr; when
 * uncertain it returns null rather than guessing.
 */
function classifyKilledReason(args: { exitCode: number | null; stderr: string; timedOut: boolean }): KilledReason {
  if (args.timedOut) return "wall_time";
  if (args.exitCode === null) return null;
  // SIGABRT (134) from V8 heap-limit abort, or a Python MemoryError message.
  if (args.exitCode === 134 || /heap out of memory/i.test(args.stderr) || /MemoryError/.test(args.stderr)) {
    return "memory";
  }
  // Shell couldn't fork/exec because ulimit -u was hit.
  if (/Resource temporarily unavailable|Cannot allocate memory|fork:/i.test(args.stderr)) {
    return "process_limit";
  }
  // SIGXCPU (128+24=152) if the kernel enforces ulimit -t directly.
  if (args.exitCode === 152) return "cpu_time";
  return null;
}
