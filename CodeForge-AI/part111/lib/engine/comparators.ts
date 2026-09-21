import type { CheckerConfig } from "./types";

export interface ComparisonResult {
  matches: boolean;
  reason?: string; // internal diagnostic only — never forwarded to the student
}

function normalizeWhitespace(s: string): string {
  return s
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function compareExact(actual: string, expected: string): ComparisonResult {
  return { matches: actual === expected, reason: "exact string comparison" };
}

function compareWhitespaceNormalized(actual: string, expected: string): ComparisonResult {
  const a = normalizeWhitespace(actual);
  const e = normalizeWhitespace(expected);
  return { matches: a === e, reason: "whitespace-normalized comparison" };
}

/**
 * Tokenizes both outputs; numeric tokens are compared with abs/rel
 * tolerance, non-numeric tokens must match exactly. Avoids naive
 * string comparison rejecting mathematically-equivalent floats
 * (e.g. "2" vs "2.0", or values that differ only past the tolerance).
 */
function compareNumericTolerance(
  actual: string,
  expected: string,
  absTol: number,
  relTol: number
): ComparisonResult {
  const aTokens = normalizeWhitespace(actual).split(/\s+/).filter(Boolean);
  const eTokens = normalizeWhitespace(expected).split(/\s+/).filter(Boolean);

  if (aTokens.length !== eTokens.length) {
    return { matches: false, reason: `token count mismatch: ${aTokens.length} vs ${eTokens.length}` };
  }

  for (let i = 0; i < eTokens.length; i++) {
    const aTok = aTokens[i]!;
    const eTok = eTokens[i]!;
    const aNum = Number(aTok);
    const eNum = Number(eTok);
    const bothNumeric = aTok !== "" && eTok !== "" && !Number.isNaN(aNum) && !Number.isNaN(eNum);

    if (bothNumeric) {
      const diff = Math.abs(aNum - eNum);
      const tolerance = Math.max(absTol, relTol * Math.abs(eNum));
      if (diff > tolerance) {
        return { matches: false, reason: `token ${i}: |${aNum}-${eNum}|=${diff} exceeds tolerance ${tolerance}` };
      }
    } else if (aTok !== eTok) {
      return { matches: false, reason: `token ${i}: non-numeric mismatch` };
    }
  }
  return { matches: true };
}

export function compareOutputs(
  actual: string,
  expected: string,
  checker: CheckerConfig
): ComparisonResult {
  switch (checker.kind) {
    case "exact":
      return compareExact(actual, expected);
    case "whitespace_normalized":
      return compareWhitespaceNormalized(actual, expected);
    case "numeric_tolerance":
      return compareNumericTolerance(
        actual,
        expected,
        checker.absTolerance ?? 1e-6,
        checker.relTolerance ?? 1e-9
      );
    case "structured":
      // Order-independent structural comparison over whitespace-separated
      // numeric/text lines — a real, if intentionally modest, implementation
      // of "multiple valid output" support (e.g. any valid ordering of a set).
      return compareStructured(actual, expected);
    case "custom":
      throw new Error(
        "compareOutputs() does not run custom checkers — see lib/engine/custom-checker.ts, " +
          "which executes them inside the sandbox, isolated from candidate code."
      );
    default: {
      const exhaustive: never = checker.kind;
      throw new Error(`Unknown checker kind: ${exhaustive}`);
    }
  }
}

function compareStructured(actual: string, expected: string): ComparisonResult {
  const aLines = normalizeWhitespace(actual).split("\n").map((l) => l.trim()).sort();
  const eLines = normalizeWhitespace(expected).split("\n").map((l) => l.trim()).sort();
  const matches = aLines.length === eLines.length && aLines.every((l, i) => l === eLines[i]);
  return { matches, reason: "order-independent line-set comparison" };
}
