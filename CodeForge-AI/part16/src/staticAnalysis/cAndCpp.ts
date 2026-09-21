import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SupportedLanguage } from "../domain/enums.js";
import type { StaticFinding } from "../domain/types.js";
import type { StaticAnalyzer } from "./types.js";

// Matches real gcc/g++ diagnostic lines, e.g.:
// submission.c:12:5: error: 'x' undeclared (first use in this function)
// submission.cpp:8:10: warning: comparison of integer expressions of different signedness [-Wsign-compare]
const DIAGNOSTIC_RE = /^(.+?):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$/;

class CFamilyStaticAnalyzer implements StaticAnalyzer {
  availability: "available" | "unavailable" = "unavailable";
  reasonUnavailable?: string;

  constructor(
    private readonly language: SupportedLanguage.C | SupportedLanguage.CPP,
    private readonly compiler: string,
    private readonly ext: string,
    private readonly std: string
  ) {
    const check = spawnSync(this.compiler, ["--version"]);
    if (check.status === 0) {
      this.availability = "available";
    } else {
      this.reasonUnavailable = `${this.compiler} not found on PATH`;
    }
  }

  async analyze(sourceCode: string): Promise<StaticFinding[]> {
    if (this.availability === "unavailable") return [];

    const dir = mkdtempSync(path.join(tmpdir(), "cf-cfam-"));
    const srcPath = path.join(dir, `submission${this.ext}`);
    try {
      writeFileSync(srcPath, sourceCode, "utf-8");
      const result = spawnSync(
        this.compiler,
        ["-fsyntax-only", "-Wall", "-Wextra", `-std=${this.std}`, srcPath],
        { encoding: "utf-8", timeout: 8000 }
      );
      const stderrLines = (result.stderr ?? "").split("\n");
      const findings: StaticFinding[] = [];
      for (const line of stderrLines) {
        const m = DIAGNOSTIC_RE.exec(line.trim());
        if (!m) continue;
        const [, , lineNo, colNo, level, message] = m;
        if (level === "note") continue; // notes are supplementary, not standalone findings
        findings.push({
          ruleId: `${this.language}-compiler-diagnostic`,
          language: this.language,
          message: message ?? "",
          severity: level === "error" ? "error" : "warning",
          source: "compiler-diagnostic",
          range: { startLine: Number(lineNo), endLine: Number(lineNo), startCol: Number(colNo) },
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

export class CStaticAnalyzer extends CFamilyStaticAnalyzer {
  constructor() {
    super(SupportedLanguage.C, "gcc", ".c", "c11");
  }
}

export class CppStaticAnalyzer extends CFamilyStaticAnalyzer {
  constructor() {
    super(SupportedLanguage.CPP, "g++", ".cpp", "c++17");
  }
}
