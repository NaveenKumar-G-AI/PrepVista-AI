/**
 * Deterministic code location extraction.
 *
 * Rule: a CodeLocation's line numbers are only ever populated from evidence
 * we can point to. There are exactly two sources of truth:
 *
 *   1. STACK_TRACE — parsed directly out of a real compiler/runtime error
 *      string produced by the execution system. Highest confidence.
 *   2. STATIC_HEURISTIC — a regex/indentation scan of the student's actual
 *      submitted source to find the function most likely relevant (e.g.
 *      the problem's expected entry point). Used when there's no crash to
 *      point to (wrong-answer cases).
 *
 * If neither applies, we return UNKNOWN_LOCATION and every downstream
 * consumer (prompt builder, output guard, UI "jump to line" button) is
 * required to treat that as "no verified location" rather than guessing.
 */

import { CodeLocation, UNKNOWN_LOCATION } from "./types";

// ---------------------------------------------------------------------------
// 1. Stack trace parsing
// ---------------------------------------------------------------------------

interface StackFrame {
  file: string;
  line: number;
  functionName: string | null;
}

const STACK_PATTERNS: Array<{ lang: string; regex: RegExp; group: { file: number; line: number; fn?: number } }> = [
  // Python: File "solution.py", line 12, in solve
  {
    lang: "python",
    regex: /File "([^"]+)", line (\d+)(?:, in (\S+))?/g,
    group: { file: 1, line: 2, fn: 3 },
  },
  // JavaScript/TypeScript (V8): at solve (solution.js:12:5)  OR  at solution.js:12:5
  {
    lang: "javascript",
    regex: /at\s+(?:(\S+)\s+\()?([^\s():]+):(\d+):(\d+)\)?/g,
    group: { file: 2, line: 3, fn: 1 },
  },
  // Java: at Solution.solve(Solution.java:12)
  {
    lang: "java",
    regex: /at\s+[\w.$]+\.(\w+)\(([\w$]+\.java):(\d+)\)/g,
    group: { file: 2, line: 3, fn: 1 },
  },
  // C++ (gcc/g++ style): solution.cpp:12:5: error: ...
  {
    lang: "cpp",
    regex: /([\w./-]+\.(?:cpp|cc|h|hpp)):(\d+):(\d+):/g,
    group: { file: 1, line: 2 },
  },
];

/**
 * Extract the LAST (deepest / most specific, and for compiler errors
 * typically the most relevant) frame that plausibly refers to the
 * student's own submitted file rather than a language runtime/stdlib
 * frame. We bias toward frames whose filename looks like a submission
 * file (solution.*, main.*, Solution.*) when we can tell; otherwise we
 * take the first frame found, which for compiler errors is the actual
 * error site.
 */
export function extractLocationFromStackTrace(stackTraceOrCompilerError: string | null): CodeLocation | null {
  if (!stackTraceOrCompilerError || stackTraceOrCompilerError.trim().length === 0) return null;

  const candidates: StackFrame[] = [];

  for (const pattern of STACK_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(stackTraceOrCompilerError)) !== null) {
      const file = match[pattern.group.file];
      const lineStr = match[pattern.group.line];
      if (!file || !lineStr) continue;
      const line = Number.parseInt(lineStr, 10);
      if (Number.isNaN(line)) continue;
      const functionName = pattern.group.fn ? match[pattern.group.fn] ?? null : null;
      candidates.push({ file, line, functionName });
    }
  }

  if (candidates.length === 0) return null;

  // Prefer a frame that looks like student-submitted code (not a
  // language runtime internal path); otherwise fall back to the first.
  const looksLikeSubmission = (f: StackFrame) =>
    /solution|main|submission|answer/i.test(f.file) && !/site-packages|node_modules|lib\/python|<frozen/i.test(f.file);

  const best = candidates.find(looksLikeSubmission) ?? candidates[0];
  if (!best) return null;

  return {
    file: best.file,
    functionName: best.functionName,
    startLine: best.line,
    endLine: best.line,
    snippet: null,
    sourceOfTruth: "STACK_TRACE",
  };
}

// ---------------------------------------------------------------------------
// 2. Static heuristic locator (no crash — find the likely entry function)
// ---------------------------------------------------------------------------

interface FunctionDefRegex {
  regex: RegExp;
  nameGroup: number;
}

const FUNCTION_DEF_PATTERNS: Record<string, FunctionDefRegex> = {
  python: { regex: /^[ \t]*def\s+([A-Za-z_]\w*)\s*\(/gm, nameGroup: 1 },
  javascript: {
    regex: /^[ \t]*(?:export\s+)?(?:function\s+([A-Za-z_$]\w*)\s*\(|const\s+([A-Za-z_$]\w*)\s*=\s*(?:\(|function))/gm,
    nameGroup: 1,
  },
  typescript: {
    regex: /^[ \t]*(?:export\s+)?(?:function\s+([A-Za-z_$]\w*)\s*\(|const\s+([A-Za-z_$]\w*)\s*[:=])/gm,
    nameGroup: 1,
  },
  java: { regex: /^[ \t]*(?:public|private|protected|static|\s)*[\w<>\[\]]+\s+([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/gm, nameGroup: 1 },
  cpp: { regex: /^[ \t]*[\w:<>\*&\s]+\s+([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/gm, nameGroup: 1 },
};

/**
 * Find the function definition in `code` whose name matches one of the
 * problem's known entry-point hints (e.g. ["solve", "twoSum"]). If none
 * match by name, falls back to the LAST top-level function defined
 * (commonly the "main solution" function in these problem formats,
 * since helper functions are usually defined first). Returns null if no
 * function definition can be found at all — we do not guess a location
 * from thin air.
 */
export function locateEntryFunction(
  code: string,
  language: string,
  entryPointHints: string[]
): CodeLocation | null {
  const pattern = FUNCTION_DEF_PATTERNS[language.toLowerCase()];
  if (!pattern) return null;

  const lines = code.split("\n");
  const matches: Array<{ name: string; line: number }> = [];

  const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
  let m: RegExpExecArray | null;
  while ((m = regex.exec(code)) !== null) {
    const name = m[pattern.nameGroup] ?? m[pattern.nameGroup + 1];
    if (!name) continue;
    const upToMatch = code.slice(0, m.index);
    const line = upToMatch.split("\n").length;
    matches.push({ name, line });
  }

  if (matches.length === 0) return null;

  const hinted = matches.find((f) => entryPointHints.some((h) => h.toLowerCase() === f.name.toLowerCase()));
  const chosen = hinted ?? matches[matches.length - 1];
  if (!chosen) return null;

  const endLine = findHeuristicFunctionEnd(lines, chosen.line, language);
  const snippet = lines
    .slice(chosen.line - 1, Math.min(endLine, chosen.line - 1 + 12))
    .join("\n")
    .slice(0, 800);

  return {
    file: null,
    functionName: chosen.name,
    startLine: chosen.line,
    endLine,
    snippet,
    sourceOfTruth: "STATIC_HEURISTIC",
  };
}

/** Very small indentation-aware scan to approximate where a function body ends. */
function findHeuristicFunctionEnd(lines: string[], startLine: number, language: string): number {
  if (language.toLowerCase() === "python") {
    const startIndent = (lines[startLine - 1] ?? "").search(/\S/);
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) continue;
      const indent = line.search(/\S/);
      if (indent !== -1 && indent <= startIndent) return i; // 1-indexed exclusive end
    }
    return lines.length;
  }
  // Brace-counting languages
  let depth = 0;
  let started = false;
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (started && depth <= 0) return i + 1;
  }
  return Math.min(startLine + 30, lines.length);
}

/**
 * Top-level entry point: given available evidence, produce the best
 * CodeLocation we can honestly stand behind, in priority order:
 * stack trace > static heuristic > UNKNOWN_LOCATION.
 */
export function locateRelevantCode(params: {
  stackTraceOrCompilerError: string | null;
  code: string;
  language: string;
  entryPointHints: string[];
}): CodeLocation {
  const fromTrace = extractLocationFromStackTrace(params.stackTraceOrCompilerError);
  if (fromTrace) return fromTrace;

  const fromHeuristic = locateEntryFunction(params.code, params.language, params.entryPointHints);
  if (fromHeuristic) return fromHeuristic;

  return UNKNOWN_LOCATION;
}
