import { describe, it, expect } from "vitest";
import { JavaStaticAnalyzer } from "../../src/staticAnalysis/java.js";

const analyzer = new JavaStaticAnalyzer();

describe("JavaStaticAnalyzer (real javac)", () => {
  it("is available in this environment", () => {
    expect(analyzer.availability).toBe("available");
  });

  it("reports a real compiler error for a type mismatch", async () => {
    const src = [
      "public class Submission {",
      "  public static void main(String[] args) {",
      "    int x = \"hello\";",
      "  }",
      "}",
      "",
    ].join("\n");
    const findings = await analyzer.analyze(src, "Submission.java");
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("compiles cleanly for correct code", async () => {
    const src = [
      "public class Submission {",
      "  static int add(int a, int b) { return a + b; }",
      "  public static void main(String[] args) {",
      "    System.out.println(add(2, 3));",
      "  }",
      "}",
      "",
    ].join("\n");
    const findings = await analyzer.analyze(src, "Submission.java");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
