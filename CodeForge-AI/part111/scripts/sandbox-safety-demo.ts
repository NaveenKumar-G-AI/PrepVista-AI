import { runInSandbox } from "../lib/sandbox/runner";

const DEFAULT_LIMITS = { timeMs: 2000, memoryMb: 256, outputKb: 256, pidsLimit: 32 };

const cases: Array<{
  name: string;
  language: string;
  source: string;
  stdin?: string;
  limits?: typeof DEFAULT_LIMITS;
  expect: string;
}> = [
  {
    name: "correct echo (python)",
    language: "python3",
    source: `n = int(input())\nprint(n * 2)\n`,
    stdin: "21\n",
    expect: "ok, stdout '42'",
  },
  {
    name: "infinite loop (python) -> timeout",
    language: "python3",
    source: `while True:\n    pass\n`,
    limits: { ...DEFAULT_LIMITS, timeMs: 1500 },
    expect: "timeout, ~1.5s",
  },
  {
    name: "memory bomb (python) -> memory_exceeded",
    language: "python3",
    source: `x = []\nwhile True:\n    x.append("a" * 10**6)\n`,
    limits: { ...DEFAULT_LIMITS, memoryMb: 128, timeMs: 5000 },
    expect: "memory_exceeded",
  },
  {
    name: "memory bomb (node) -> memory_exceeded via RSS watchdog",
    language: "node",
    source: `let x = [];\nwhile (true) { x.push(new Array(2e6).fill(97)); }\n`,
    limits: { ...DEFAULT_LIMITS, memoryMb: 128, timeMs: 5000 },
    expect: "memory_exceeded",
  },
  {
    name: "fork bomb (python) -> contained, no crash",
    language: "python3",
    source: `import os\ntry:\n    while True:\n        os.fork()\nexcept OSError:\n    print("contained")\n`,
    limits: { ...DEFAULT_LIMITS, timeMs: 3000, pidsLimit: 16 },
    expect: "ok or runtime_error, but MUST return quickly and not hang",
  },
  {
    name: "huge output (python) -> output_exceeded",
    language: "python3",
    source: `while True:\n    print("a" * 1000)\n`,
    limits: { ...DEFAULT_LIMITS, timeMs: 5000, outputKb: 64 },
    expect: "output_exceeded, stdout truncated to ~64KB",
  },
  {
    name: "env/network/filesystem probe (python) -> contained",
    language: "python3",
    source: `
import os, socket
print("env keys:", sorted(os.environ.keys()))
try:
    with open("/etc/passwd") as f:
        print("READ /etc/passwd:", f.read()[:50])
except Exception as e:
    print("cannot read /etc/passwd:", type(e).__name__)
try:
    s = socket.create_connection(("93.184.216.34", 80), timeout=2)
    print("NETWORK REACHABLE (should not happen)")
except OSError as e:
    print("network blocked:", e)
`,
    limits: { ...DEFAULT_LIMITS, timeMs: 4000 },
    expect: "minimal env, no /etc/passwd, network blocked",
  },
  {
    name: "runtime error (python) -> runtime_error",
    language: "python3",
    source: `print(1/0)\n`,
    expect: "runtime_error",
  },
];

async function main() {
  console.log(`Running ${cases.length} sandbox safety cases...\n`);
  let pass = 0;
  for (const c of cases) {
    const start = Date.now();
    const result = await runInSandbox({
      language: c.language,
      sourceCode: c.source,
      stdin: c.stdin ?? "",
      limits: c.limits ?? DEFAULT_LIMITS,
    });
    const elapsed = Date.now() - start;
    console.log(`--- ${c.name} ---`);
    console.log(`  expected:    ${c.expect}`);
    console.log(`  outcome:     ${result.outcome}`);
    console.log(`  exitCode:    ${result.exitCode}  signal: ${result.signal}`);
    console.log(`  execTimeMs:  ${result.execTimeMs} (wall clock: ${elapsed}ms)`);
    console.log(`  truncated:   ${result.truncatedOutput}`);
    console.log(`  stdout:      ${JSON.stringify(result.stdout.slice(0, 200))}`);
    if (result.stderrSummary) console.log(`  stderr:      ${JSON.stringify(result.stderrSummary.slice(0, 300))}`);
    console.log();
    pass++;
  }
  console.log(`Completed ${pass}/${cases.length} cases (see outcomes above — this script reports reality, it does not assert pass/fail itself).`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
