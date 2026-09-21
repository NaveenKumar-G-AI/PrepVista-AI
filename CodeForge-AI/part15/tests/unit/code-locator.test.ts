import { describe, expect, it } from "vitest";
import { extractLocationFromStackTrace, locateEntryFunction, locateRelevantCode } from "@/lib/hint-ladder/code-locator";

describe("extractLocationFromStackTrace", () => {
  it("parses a Python traceback and prefers the submission frame", () => {
    const trace = [
      'Traceback (most recent call last):',
      '  File "runner.py", line 5, in <module>',
      '    result = solution.solve(nums)',
      '  File "solution.py", line 12, in solve',
      '    return nums[len(nums)]',
      "IndexError: list index out of range",
    ].join("\n");
    const loc = extractLocationFromStackTrace(trace);
    expect(loc).not.toBeNull();
    expect(loc?.file).toBe("solution.py");
    expect(loc?.startLine).toBe(12);
    expect(loc?.sourceOfTruth).toBe("STACK_TRACE");
  });

  it("parses a JS stack trace", () => {
    const trace = "TypeError: Cannot read properties of undefined\n    at solve (solution.js:8:12)\n    at Object.<anonymous> (runner.js:3:5)";
    const loc = extractLocationFromStackTrace(trace);
    expect(loc?.file).toBe("solution.js");
    expect(loc?.startLine).toBe(8);
    expect(loc?.functionName).toBe("solve");
  });

  it("returns null for empty or missing trace — never fabricates a location", () => {
    expect(extractLocationFromStackTrace(null)).toBeNull();
    expect(extractLocationFromStackTrace("")).toBeNull();
    expect(extractLocationFromStackTrace("   ")).toBeNull();
  });

  it("returns null when the trace has no recognizable frame", () => {
    expect(extractLocationFromStackTrace("Something went wrong, no idea where")).toBeNull();
  });
});

describe("locateEntryFunction", () => {
  it("finds a Python function by matching the problem's entry-point hint", () => {
    const code = [
      "def helper(x):",
      "    return x * 2",
      "",
      "def solve(nums):",
      "    total = 0",
      "    for i in range(len(nums)):",
      "        total += nums[i]",
      "    return total",
    ].join("\n");
    const loc = locateEntryFunction(code, "python", ["solve"]);
    expect(loc?.functionName).toBe("solve");
    expect(loc?.startLine).toBe(4);
    expect(loc?.sourceOfTruth).toBe("STATIC_HEURISTIC");
    expect(loc?.snippet).toContain("total");
  });

  it("falls back to the last defined function when no hint matches", () => {
    const code = "def a():\n    pass\n\ndef b():\n    pass\n";
    const loc = locateEntryFunction(code, "python", ["nonexistent"]);
    expect(loc?.functionName).toBe("b");
  });

  it("returns null when the language has no matcher or no functions exist", () => {
    expect(locateEntryFunction("SELECT * FROM x;", "sql", [])).toBeNull();
    expect(locateEntryFunction("", "python", [])).toBeNull();
  });
});

describe("locateRelevantCode (priority: stack trace > heuristic > unknown)", () => {
  it("prefers stack trace evidence over static heuristic", () => {
    const loc = locateRelevantCode({
      stackTraceOrCompilerError: 'File "solution.py", line 3, in solve',
      code: "def solve(nums):\n    return nums[0]\n    x = 1",
      language: "python",
      entryPointHints: ["solve"],
    });
    expect(loc.sourceOfTruth).toBe("STACK_TRACE");
    expect(loc.startLine).toBe(3);
  });

  it("falls back to heuristic when there is no trace", () => {
    const loc = locateRelevantCode({
      stackTraceOrCompilerError: null,
      code: "def solve(nums):\n    return sum(nums)\n",
      language: "python",
      entryPointHints: ["solve"],
    });
    expect(loc.sourceOfTruth).toBe("STATIC_HEURISTIC");
  });

  it("honestly returns UNKNOWN rather than guessing when nothing matches", () => {
    const loc = locateRelevantCode({
      stackTraceOrCompilerError: null,
      code: "not real code at all just text",
      language: "python",
      entryPointHints: ["solve"],
    });
    expect(loc.sourceOfTruth).toBe("NONE");
    expect(loc.startLine).toBeNull();
  });
});
