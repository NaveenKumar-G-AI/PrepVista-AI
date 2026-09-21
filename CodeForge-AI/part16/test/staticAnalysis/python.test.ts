import { describe, it, expect } from "vitest";
import { PythonStaticAnalyzer } from "../../src/staticAnalysis/python.js";

const analyzer = new PythonStaticAnalyzer();

describe("PythonStaticAnalyzer (real CPython ast)", () => {
  it("is available in this environment", () => {
    expect(analyzer.availability).toBe("available");
  });

  it("reports a real SyntaxError with the exact line CPython reports", async () => {
    const src = "def f(x)\n    return x + 1\n"; // missing colon
    const findings = await analyzer.analyze(src, "submission.py");
    expect(findings.some((f) => f.ruleId === "py-syntax-error")).toBe(true);
    const f = findings.find((x) => x.ruleId === "py-syntax-error")!;
    expect(f.range?.startLine).toBe(1);
  });

  it("detects a mutable default argument", async () => {
    const src = "def add_item(item, bucket=[]):\n    bucket.append(item)\n    return bucket\n";
    const findings = await analyzer.analyze(src, "submission.py");
    expect(findings.some((f) => f.ruleId === "py-mutable-default-arg")).toBe(true);
  });

  it("detects a bare except", async () => {
    const src = "def f(x):\n    try:\n        return 1 / x\n    except:\n        return 0\n";
    const findings = await analyzer.analyze(src, "submission.py");
    expect(findings.some((f) => f.ruleId === "py-bare-except")).toBe(true);
  });

  it("detects '== None' instead of 'is None'", async () => {
    const src = "def f(x):\n    if x == None:\n        return 0\n    return x\n";
    const findings = await analyzer.analyze(src, "submission.py");
    expect(findings.some((f) => f.ruleId === "py-eq-none")).toBe(true);
  });

  it("flags recursion with no visible conditional return as a heuristic (not a hard fact)", async () => {
    const src = "def f(n):\n    return n * f(n - 1)\n"; // no base case at all
    const findings = await analyzer.analyze(src, "submission.py");
    const rec = findings.find((f) => f.ruleId === "py-recursion-missing-base-case-heuristic");
    expect(rec).toBeDefined();
    expect(rec!.source).toBe("heuristic");
  });

  it("clean, idiomatic code produces no findings", async () => {
    const src = [
      "def factorial(n):",
      "    if n <= 1:",
      "        return 1",
      "    return n * factorial(n - 1)",
      "",
    ].join("\n");
    const findings = await analyzer.analyze(src, "submission.py");
    expect(findings).toEqual([]);
  });
});
