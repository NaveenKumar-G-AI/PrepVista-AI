import { describe, it, expect } from "vitest";
import { runInSandbox } from "../../lib/sandbox/runner";

// These tests actually spawn su/bwrap/ulimit/timeout and run real
// programs — no mocking. Slower than unit tests by design; that's the
// cost of the claims being true. See docs/ARCHITECTURE.md#sandbox for
// what's verified here vs. what still needs a production-grade sandbox
// (gVisor/Firecracker/Docker) for a real deployment.

describe("sandbox: correctness path", () => {
  it("runs correct code and returns its stdout", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode: "print(int(input()) * 2)",
      stdin: "21\n",
      limits: { timeMs: 2000, memoryMb: 256, outputKb: 64 },
    });
    expect(r.outcome).toBe("ok");
    expect(r.stdout.trim()).toBe("42");
  });

  it("classifies an uncaught exception as runtime_error, not a crash", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode: "print(1/0)",
      stdin: "",
      limits: { timeMs: 2000, memoryMb: 256, outputKb: 64 },
    });
    expect(r.outcome).toBe("runtime_error");
    expect(r.exitCode).not.toBe(0);
  });
});

describe("sandbox: resource limits are real, not simulated", () => {
  it("kills an infinite loop at the wall-clock limit", async () => {
    const start = Date.now();
    const r = await runInSandbox({
      language: "python3",
      sourceCode: "while True:\n    pass\n",
      stdin: "",
      limits: { timeMs: 1200, memoryMb: 128, outputKb: 32 },
    });
    const elapsed = Date.now() - start;
    expect(r.outcome).toBe("timeout");
    expect(elapsed).toBeLessThan(4000); // generous ceiling; must not hang
  });

  it("kills a memory bomb via ulimit (python)", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode: 'x = []\nwhile True:\n    x.append("a" * 10**6)\n',
      stdin: "",
      limits: { timeMs: 5000, memoryMb: 96, outputKb: 32 },
    });
    expect(r.outcome).toBe("memory_exceeded");
  });

  it("kills a memory bomb via the RSS watchdog (node, where ulimit -v cannot be used)", async () => {
    const r = await runInSandbox({
      language: "node",
      sourceCode: "let x = [];\nwhile (true) { x.push(new Array(2e6).fill(97)); }\n",
      stdin: "",
      limits: { timeMs: 5000, memoryMb: 96, outputKb: 32 },
    });
    expect(r.outcome).toBe("memory_exceeded");
  });

  it("truncates and flags output that exceeds the configured cap", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode: 'while True:\n    print("a" * 1000)\n',
      stdin: "",
      limits: { timeMs: 5000, memoryMb: 128, outputKb: 32 },
    });
    expect(r.outcome).toBe("output_exceeded");
    expect(r.truncatedOutput).toBe(true);
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(33 * 1024);
  });

  it("contains a fork bomb without hanging or crashing the harness", async () => {
    const start = Date.now();
    const r = await runInSandbox({
      language: "python3",
      sourceCode:
        "import os\ntry:\n    while True:\n        os.fork()\nexcept OSError:\n    print('contained')\n",
      stdin: "",
      limits: { timeMs: 3000, memoryMb: 128, outputKb: 32, pidsLimit: 16 },
    });
    expect(Date.now() - start).toBeLessThan(4000);
    expect(["ok", "runtime_error"]).toContain(r.outcome);
  });
});

describe("sandbox: isolation", () => {
  it("cannot reach the network", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode:
        "import socket\ntry:\n    socket.create_connection(('93.184.216.34', 80), timeout=2)\n    print('REACHABLE')\nexcept OSError:\n    print('blocked')\n",
      stdin: "",
      limits: { timeMs: 4000, memoryMb: 128, outputKb: 32 },
    });
    expect(r.stdout.trim()).toBe("blocked");
  });

  it("cannot read host files outside the bound work directory", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode:
        "try:\n    open('/etc/passwd').read()\n    print('READABLE')\nexcept Exception:\n    print('blocked')\n",
      stdin: "",
      limits: { timeMs: 2000, memoryMb: 128, outputKb: 32 },
    });
    expect(r.stdout.trim()).toBe("blocked");
  });

  it("does not receive host secrets even if the parent process's own env has them", async () => {
    process.env.__HTE_TEST_SECRET__ = "should-never-appear-in-sandbox";
    const r = await runInSandbox({
      language: "python3",
      sourceCode: "import os\nprint(os.environ.get('__HTE_TEST_SECRET__', 'ABSENT'))",
      stdin: "",
      limits: { timeMs: 2000, memoryMb: 128, outputKb: 32 },
    });
    delete process.env.__HTE_TEST_SECRET__;
    expect(r.stdout.trim()).toBe("ABSENT");
  });
});

describe("sandbox: stderr sanitization", () => {
  it("strips absolute workdir paths from the diagnostic summary", async () => {
    const r = await runInSandbox({
      language: "python3",
      sourceCode: "raise ValueError('boom')",
      stdin: "",
      limits: { timeMs: 2000, memoryMb: 128, outputKb: 32 },
    });
    expect(r.stderrSummary).not.toMatch(/\/var\/lib\/hidden-test-engine\/sandbox\/run-/);
  });
});
