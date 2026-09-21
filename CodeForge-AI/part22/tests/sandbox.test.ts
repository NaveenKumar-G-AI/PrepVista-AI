import { describe, expect, it } from "vitest";
import { ProcessSandboxExecutor } from "../src/sandbox/executor.js";

const executor = new ProcessSandboxExecutor();

describe("ProcessSandboxExecutor - normal execution", () => {
  it("runs simple python and captures stdout", async () => {
    const result = await executor.run({ language: "python", code: "print('hello')" });
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("runs simple javascript and captures stdout", async () => {
    const result = await executor.run({ language: "javascript", code: "console.log('hi')" });
    expect(result.stdout.trim()).toBe("hi");
    expect(result.exitCode).toBe(0);
  });

  it("passes stdin through to python", async () => {
    const result = await executor.run({ language: "python", code: "import sys\nprint(sys.stdin.read().strip().upper())", stdin: "abc" });
    expect(result.stdout.trim()).toBe("ABC");
  });

  it("captures a python traceback on stderr with a nonzero exit code", async () => {
    const result = await executor.run({ language: "python", code: "1/0" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/ZeroDivisionError/);
  });
});

describe("ProcessSandboxExecutor - adversarial containment", () => {
  it("kills an infinite loop at the wall-clock limit", async () => {
    const result = await executor.run({ language: "python", code: "while True:\n    pass", limits: { wallTimeMs: 2000 } });
    expect(result.timedOut).toBe(true);
    expect(result.killedReason).toBe("wall_time");
  }, 10_000);

  it("contains a python memory-exhaustion loop", async () => {
    const result = await executor.run({
      language: "python",
      code: "x = []\nwhile True:\n    x.append('a' * 10_000_000)",
      limits: { memoryKB: 262_144, wallTimeMs: 8000, cpuTimeSec: 6 }
    });
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toMatch(/MemoryError/);
  }, 12_000);

  it("contains a python fork bomb via ulimit -u rather than exhausting host processes", async () => {
    const result = await executor.run({
      language: "python",
      code: "import os\nn = 0\ntry:\n    while True:\n        os.fork()\n        n += 1\nexcept OSError as e:\n    print(f'stopped after {n} forks')",
      limits: { maxProcesses: 16, wallTimeMs: 6000, cpuTimeSec: 5 }
    });
    expect(result.stdout).toMatch(/stopped after \d+ forks/);
  }, 10_000);

  it("denies network access from executed code", async () => {
    const result = await executor.run({
      language: "python",
      code: [
        "import urllib.request",
        "try:",
        "    urllib.request.urlopen('https://pypi.org', timeout=2)",
        "    print('NETWORK_REACHED')",
        "except Exception as e:",
        "    print('NETWORK_BLOCKED', type(e).__name__)"
      ].join("\n"),
      limits: { wallTimeMs: 5000, cpuTimeSec: 4 }
    });
    expect(result.stdout).toMatch(/NETWORK_BLOCKED/);
    expect(result.stdout).not.toMatch(/NETWORK_REACHED/);
  }, 8000);

  it("denies reading a permission-protected file", async () => {
    const result = await executor.run({ language: "python", code: "open('/etc/shadow').read()" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/PermissionError|Permission denied/);
  }, 6000);

  it("truncates rather than hanging on runaway output volume", async () => {
    const result = await executor.run({
      language: "python",
      code: "for i in range(2_000_000):\n    print('x' * 200)",
      limits: { wallTimeMs: 4000, cpuTimeSec: 3 }
    });
    expect(result.truncatedOutput || result.timedOut).toBe(true);
  }, 8000);

  it("denies child_process spawning from executed javascript via Node's permission model", async () => {
    const result = await executor.run({
      language: "javascript",
      code: [
        "try {",
        "  require('child_process').execSync('echo spawned');",
        "  console.log('SPAWN_SUCCEEDED');",
        "} catch (e) {",
        "  console.log('SPAWN_BLOCKED', e.code);",
        "}"
      ].join("\n")
    });
    expect(result.stdout).toMatch(/SPAWN_BLOCKED/);
    expect(result.stdout).not.toMatch(/SPAWN_SUCCEEDED/);
  }, 8000);

  it("does not crash the JS runner's own startup - regression guard for the ulimit-v/V8 gotcha", async () => {
    const result = await executor.run({ language: "javascript", code: "console.log('ok')" });
    expect(result.stdout.trim()).toBe("ok");
    expect(result.exitCode).toBe(0);
  });

  it("contains a javascript heap-exhaustion loop via --max-old-space-size", async () => {
    const result = await executor.run({
      language: "javascript",
      code: "const arr = [];\nwhile (true) { arr.push(new Array(1_000_000).fill('x')); }",
      limits: { jsHeapMB: 96, wallTimeMs: 8000, cpuTimeSec: 6 }
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
  }, 12_000);
});

describe("ProcessSandboxExecutor - python structured trace", () => {
  it("produces call/line/return events scoped to the user's file", async () => {
    const code = ["def add(a, b):", "    c = a + b", "    return c", "", "print(add(2, 3))"].join("\n");
    const result = await executor.run({ language: "python", code, pythonTrace: true });
    expect(result.stdout.trim()).toBe("5");
    expect(result.trace).toBeDefined();
    expect(result.trace!.some((e) => e.type === "call" && e.function === "add")).toBe(true);
    expect(result.trace!.some((e) => e.type === "return" && e.function === "add")).toBe(true);
  }, 8000);

  it("captures an exception event on an uncaught error", async () => {
    const result = await executor.run({ language: "python", code: "def boom():\n    return 1/0\nboom()", pythonTrace: true });
    expect(result.trace!.some((e) => e.type === "exception" && e.exceptionType === "ZeroDivisionError")).toBe(true);
  }, 8000);
});
