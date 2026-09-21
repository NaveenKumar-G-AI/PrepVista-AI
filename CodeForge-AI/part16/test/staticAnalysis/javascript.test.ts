import { describe, it, expect } from "vitest";
import { JavaScriptStaticAnalyzer } from "../../src/staticAnalysis/javascript.js";

const analyzer = new JavaScriptStaticAnalyzer();

describe("JavaScriptStaticAnalyzer (real acorn AST)", () => {
  it("reports a real SyntaxError", async () => {
    const findings = await analyzer.analyze("function f( { return 1; }");
    expect(findings.some((f) => f.ruleId === "js-syntax-error")).toBe(true);
  });

  it("flags loose equality", async () => {
    const findings = await analyzer.analyze("function isEmpty(x) { return x == null; }");
    expect(findings.some((f) => f.ruleId === "js-loose-equality")).toBe(true);
  });

  it("flags parseInt without a radix", async () => {
    const findings = await analyzer.analyze("const n = parseInt(str);");
    expect(findings.some((f) => f.ruleId === "js-parseint-no-radix")).toBe(true);
  });

  it("flags an empty catch block", async () => {
    const findings = await analyzer.analyze("try { risky(); } catch (e) {}");
    expect(findings.some((f) => f.ruleId === "js-empty-catch")).toBe(true);
  });

  it("clean code produces no findings", async () => {
    const findings = await analyzer.analyze("function add(a, b) { return a + b; }");
    expect(findings).toEqual([]);
  });
});
