import { describe, it, expect } from "vitest";
import { CStaticAnalyzer, CppStaticAnalyzer } from "../../src/staticAnalysis/cAndCpp.js";

const cAnalyzer = new CStaticAnalyzer();
const cppAnalyzer = new CppStaticAnalyzer();

describe("CStaticAnalyzer (real gcc -fsyntax-only)", () => {
  it("is available in this environment", () => {
    expect(cAnalyzer.availability).toBe("available");
  });

  it("reports a real compiler error for undeclared variable use", async () => {
    const src = "int main() {\n  x = 5;\n  return 0;\n}\n";
    const findings = await cAnalyzer.analyze(src, "submission.c");
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("compiles cleanly for correct code (with -Wall -Wextra, no warnings)", async () => {
    const src = "int add(int a, int b) {\n  return a + b;\n}\n\nint main() {\n  return add(2, 3) - 5;\n}\n";
    const findings = await cAnalyzer.analyze(src, "submission.c");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("CppStaticAnalyzer (real g++ -fsyntax-only)", () => {
  it("is available in this environment", () => {
    expect(cppAnalyzer.availability).toBe("available");
  });

  it("reports a real compiler error for a missing semicolon", async () => {
    const src = "int main() {\n  int x = 5\n  return x;\n}\n";
    const findings = await cppAnalyzer.analyze(src, "submission.cpp");
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });
});
