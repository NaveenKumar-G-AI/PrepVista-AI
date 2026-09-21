import { spawn } from "node:child_process";
import { mkdtemp, rm, chown, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getAdapter } from "./adapters";
import type { ExecutionLimits, ExecutionResult, SandboxOutcome } from "./types";

const EXECUTE_SCRIPT = "/opt/hidden-test-engine/execute.sh";
const SANDBOX_UID = 996; // sandboxrunner — resolved once at module load in a real deployment via getent
const SCRATCH_ROOT =
  process.env.SANDBOX_SCRATCH_ROOT ?? "/var/lib/hidden-test-engine/sandbox";

/**
 * Known limitation, verified empirically (see docs/ARCHITECTURE.md#memory-limiting):
 * `ulimit -v` (virtual memory) works cleanly for CPython — it raises a catchable
 * MemoryError. It does NOT work for Node/V8: V8 reserves a large virtual address
 * space (~700MB+) for its CodeRange at boot regardless of actual heap usage, so a
 * tight ulimit -v prevents Node from starting at all, for any program. For Node we
 * therefore set a generous virtual-memory backstop (well above V8's boot
 * requirement) and enforce the *real* configured limit with an external RSS
 * watchdog that polls actual resident memory and kills the process tree if it's
 * exceeded. This is a real, tested constraint of this environment, not a
 * theoretical concern — see tests/integration/sandbox.test.ts.
 */
const NODE_VMEM_BACKSTOP_MB = 1536;
const RSS_POLL_INTERVAL_MS = 40;

function isValidLimits(limits: ExecutionLimits): void {
  if (!Number.isFinite(limits.timeMs) || limits.timeMs <= 0 || limits.timeMs > 60_000) {
    throw new Error(`Refusing invalid timeMs limit: ${limits.timeMs}`);
  }
  if (!Number.isFinite(limits.memoryMb) || limits.memoryMb <= 0 || limits.memoryMb > 4096) {
    throw new Error(`Refusing invalid memoryMb limit: ${limits.memoryMb}`);
  }
  if (!Number.isFinite(limits.outputKb) || limits.outputKb <= 0 || limits.outputKb > 65536) {
    throw new Error(`Refusing invalid outputKb limit: ${limits.outputKb}`);
  }
}

async function sumProcessTreeRssKb(rootPid: number): Promise<number> {
  // Sums VmRSS across rootPid and all its descendants, by scanning /proc.
  // This is how we enforce a real memory ceiling for languages (Node) where
  // ulimit -v cannot be used at the configured limit — see module doc comment.
  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return 0;
  }
  const pids = entries.filter((e) => /^\d+$/.test(e)).map(Number);

  const ppidOf = new Map<number, number>();
  const rssOf = new Map<number, number>();

  await Promise.all(
    pids.map(async (pid) => {
      try {
        const stat = await readFile(`/proc/${pid}/status`, "utf8");
        const ppidMatch = stat.match(/^PPid:\s+(\d+)/m);
        const rssMatch = stat.match(/^VmRSS:\s+(\d+)\s+kB/m);
        if (ppidMatch) ppidOf.set(pid, Number(ppidMatch[1]));
        if (rssMatch) rssOf.set(pid, Number(rssMatch[1]));
      } catch {
        // process exited between readdir and read — fine, just skip it
      }
    })
  );

  const descendants = new Set<number>();
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift()!;
    if (descendants.has(pid)) continue;
    descendants.add(pid);
    for (const [child, parent] of ppidOf) {
      if (parent === pid && !descendants.has(child)) queue.push(child);
    }
  }

  let total = 0;
  for (const pid of descendants) total += rssOf.get(pid) ?? 0;
  return total;
}

function sanitizeStderr(raw: string): string {
  return raw
    .replace(/\/var\/lib\/hidden-test-engine\/sandbox\/[a-zA-Z0-9_-]+/g, "<workdir>")
    .replace(/\/workdir/g, "<workdir>")
    .slice(0, 2000);
}

export interface RunOptions {
  language: string;
  sourceCode: string;
  stdin: string;
  limits: ExecutionLimits;
}

export async function runInSandbox(opts: RunOptions): Promise<ExecutionResult> {
  isValidLimits(opts.limits);
  const adapter = getAdapter(opts.language);

  const workDir = await mkdtemp(path.join(SCRATCH_ROOT, "run-"));
  const startedAt = Date.now();
  let outcome: SandboxOutcome = "ok";
  let killedByUs: "timeout" | "memory_exceeded" | "output_exceeded" | null = null;

  try {
    const { interpreter, scriptRelPath, extraArgs } = await adapter.prepare(
      workDir,
      opts.sourceCode
    );
    await chown(workDir, SANDBOX_UID, SANDBOX_UID).catch(() => {});
    // adapter.prepare already wrote the file; chown the tree so the
    // unprivileged sandbox user can read (and, if needed, execute) it.
    const entries = await readdir(workDir);
    await Promise.all(
      entries.map((e) => chown(path.join(workDir, e), SANDBOX_UID, SANDBOX_UID).catch(() => {}))
    );

    const cpuSec = Math.max(1, Math.ceil(opts.limits.timeMs / 1000));
    const wallSec = Math.max(1, Math.ceil(opts.limits.timeMs / 1000));
    const memKb =
      adapter.id === "node"
        ? NODE_VMEM_BACKSTOP_MB * 1024
        : opts.limits.memoryMb * 1024;
    const pids = opts.limits.pidsLimit ?? 32;

    const invocation = [
      EXECUTE_SCRIPT,
      String(cpuSec),
      String(memKb),
      String(pids),
      String(wallSec),
      workDir,
      interpreter,
      scriptRelPath,
      ...(extraArgs ?? []),
    ].join(" ");

    const result = await new Promise<ExecutionResult>((resolve, reject) => {
      const child = spawn("su", ["-s", "/bin/bash", "sandboxrunner", "-c", invocation], {
        detached: true, // own process group, so we can kill the whole tree
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdoutBuf = "";
      let stderrBuf = "";
      let truncated = false;
      let settled = false;

      const killGroup = (reason: typeof killedByUs) => {
        if (killedByUs) return; // already killing for another reason
        killedByUs = reason;
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already dead */
        }
      };

      // RSS watchdog — the real memory enforcement for Node (see doc comment).
      const watchdog = setInterval(async () => {
        if (!child.pid || settled) return;
        const rssKb = await sumProcessTreeRssKb(child.pid);
        if (rssKb > opts.limits.memoryMb * 1024) {
          killGroup("memory_exceeded");
        }
      }, RSS_POLL_INTERVAL_MS);

      // Belt-and-suspenders: if `timeout` itself somehow didn't fire.
      const hardTimeout = setTimeout(() => {
        killGroup("timeout");
      }, opts.limits.timeMs + 3000);

      child.stdout.on("data", (chunk: Buffer) => {
        if (truncated) return;
        stdoutBuf += chunk.toString("utf8");
        if (Buffer.byteLength(stdoutBuf, "utf8") > opts.limits.outputKb * 1024) {
          truncated = true;
          stdoutBuf = stdoutBuf.slice(0, opts.limits.outputKb * 1024);
          killGroup("output_exceeded");
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < 4000) stderrBuf += chunk.toString("utf8");
      });

      child.stdin.on("error", () => {
        /* candidate may exit before reading all of stdin — not our error */
      });
      child.stdin.write(opts.stdin);
      child.stdin.end();

      child.on("error", (err) => {
        settled = true;
        clearInterval(watchdog);
        clearTimeout(hardTimeout);
        reject(err);
      });

      child.on("close", (code, signal) => {
        settled = true;
        clearInterval(watchdog);
        clearTimeout(hardTimeout);

        // IMPORTANT (verified empirically, see scripts/sandbox-safety-demo.ts):
        // when our own watchdogs kill the process, we SIGKILL the whole group
        // (including `su`), so Node observes signal='SIGKILL', code=null — that
        // case is handled by killedByUs above. But when the *inner* `timeout`
        // command fires (wall-clock limit), it only signals the innermost
        // interpreter; su/bwrap/bash/timeout then exit normally, propagating
        // exit code 137 (128+SIGKILL) up the chain rather than dying by signal
        // themselves. So code===137 — not signal==='SIGKILL' — is the real
        // timeout signature here. (Known edge case: a candidate program that
        // deliberately calls exit(137) is indistinguishable from a timeout by
        // this heuristic; in practice this is exceedingly rare and is the same
        // heuristic most `timeout`-based judges rely on.)
        let finalOutcome: SandboxOutcome;
        if (killedByUs === "memory_exceeded") finalOutcome = "memory_exceeded";
        else if (killedByUs === "output_exceeded") finalOutcome = "output_exceeded";
        else if (killedByUs === "timeout") finalOutcome = "timeout";
        else if (code === 137 || (signal === "SIGKILL" && code === null)) finalOutcome = "timeout";
        else if (code === 0) finalOutcome = "ok";
        else if (/MemoryError/.test(stderrBuf)) finalOutcome = "memory_exceeded";
        else finalOutcome = "runtime_error";

        resolve({
          outcome: finalOutcome,
          stdout: stdoutBuf,
          stderrSummary: sanitizeStderr(stderrBuf),
          exitCode: code,
          signal,
          execTimeMs: Date.now() - startedAt,
          truncatedOutput: truncated,
        });
      });
    });

    outcome = result.outcome;
    return result;
  } catch (err) {
    return {
      outcome: "system_error",
      stdout: "",
      stderrSummary: `sandbox infrastructure error: ${(err as Error).message}`,
      exitCode: null,
      signal: null,
      execTimeMs: Date.now() - startedAt,
      truncatedOutput: false,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
