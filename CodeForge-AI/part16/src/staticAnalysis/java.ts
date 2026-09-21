import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SupportedLanguage } from "../domain/enums.js";
import type { StaticFinding } from "../domain/types.js";
import type { StaticAnalyzer } from "./types.js";

// javac diagnostics look like: File.java:12: error: cannot find symbol
const DIAGNOSTIC_RE = /^(.+?):(\d+):\s+(error|warning):\s+(.*)$/;
const PUBLIC_CLASS_RE = /public\s+(?:final\s+|abstract\s+)?class\s+(\w+)/;

export class JavaStaticAnalyzer implements StaticAnalyzer {
  availability: "available" | "unavailable" = "unavailable";
  reasonUnavailable?: string;

  constructor(private readonly javacPath = "javac") {
    const check = spawnSync(this.javacPath, ["-version"]);
    if (check.status === 0) {
      this.availability = "available";
    } else {
      this.reasonUnavailable = "javac not found on PATH (JDK not installed) — only a JRE cannot compile.";
    }
  }

  async analyze(sourceCode: string): Promise<StaticFinding[]> {
    if (this.availability === "unavailable") return [];

    const dir = mkdtempSync(path.join(tmpdir(), "cf-java-"));
    const outDir = path.join(dir, "out");
    mkdirSync(outDir);
    const publicClassMatch = PUBLIC_CLASS_RE.exec(sourceCode);
    const className = publicClassMatch?.[1] ?? "Submission";
    const srcPath = path.join(dir, `${className}.java`);

    try {
      writeFileSync(srcPath, sourceCode, "utf-8");
      const result = spawnSync(this.javacPath, ["-Xlint:all", "-d", outDir, srcPath], {
        encoding: "utf-8",
        timeout: 15000,
      });
      const lines = (result.stderr ?? "").split("\n");
      const findings: StaticFinding[] = [];
      for (const line of lines) {
        const m = DIAGNOSTIC_RE.exec(line.trim());
        if (!m) continue;
        const [, , lineNo, level, message] = m;
        findings.push({
          ruleId: "java-compiler-diagnostic",
          language: SupportedLanguage.JAVA,
          message: message ?? "",
          severity: level === "error" ? "error" : "warning",
          source: "compiler-diagnostic",
          range: { startLine: Number(lineNo), endLine: Number(lineNo) },
        });
      }
      return findings;
    } catch {
      return [];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
