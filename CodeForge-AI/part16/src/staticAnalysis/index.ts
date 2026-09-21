import { SupportedLanguage } from "../domain/enums.js";
import type { StaticFinding } from "../domain/types.js";
import { PythonStaticAnalyzer } from "./python.js";
import { JavaScriptStaticAnalyzer } from "./javascript.js";
import { CStaticAnalyzer, CppStaticAnalyzer } from "./cAndCpp.js";
import { JavaStaticAnalyzer } from "./java.js";
import type { StaticAnalyzer } from "./types.js";

let analyzers: Record<SupportedLanguage, StaticAnalyzer> | null = null;

/** Lazily constructed so `--version` probes only run once per process. */
function getAnalyzers(): Record<SupportedLanguage, StaticAnalyzer> {
  if (!analyzers) {
    analyzers = {
      [SupportedLanguage.PYTHON]: new PythonStaticAnalyzer(),
      [SupportedLanguage.JAVASCRIPT]: new JavaScriptStaticAnalyzer(),
      [SupportedLanguage.C]: new CStaticAnalyzer(),
      [SupportedLanguage.CPP]: new CppStaticAnalyzer(),
      [SupportedLanguage.JAVA]: new JavaStaticAnalyzer(),
    };
  }
  return analyzers;
}

export async function runStaticAnalysis(
  language: SupportedLanguage,
  sourceCode: string,
  filename: string
): Promise<{ findings: StaticFinding[]; availability: "available" | "unavailable"; reasonUnavailable?: string }> {
  const analyzer = getAnalyzers()[language];
  if (!analyzer) {
    return { findings: [], availability: "unavailable", reasonUnavailable: `No analyzer registered for ${language}` };
  }
  const findings = await analyzer.analyze(sourceCode, filename);
  return {
    findings,
    availability: analyzer.availability,
    reasonUnavailable: analyzer.reasonUnavailable,
  };
}

/** Exposed for tests / observability that want to probe tool availability without running an analysis. */
export function getAnalyzerAvailability(): Record<SupportedLanguage, { availability: string; reason?: string }> {
  const a = getAnalyzers();
  const out = {} as Record<SupportedLanguage, { availability: string; reason?: string }>;
  for (const lang of Object.values(SupportedLanguage)) {
    out[lang] = { availability: a[lang].availability, reason: a[lang].reasonUnavailable };
  }
  return out;
}
