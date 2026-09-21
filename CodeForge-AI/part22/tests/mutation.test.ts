import { describe, expect, it } from "vitest";
import { ProcessSandboxExecutor } from "../src/sandbox/executor.js";
import { generateVerifiedMutation, proposeMutations, validateMutation, type MutationTestCase } from "../src/mutation/pipeline.js";

const executor = new ProcessSandboxExecutor();

const REFERENCE_CODE = ["import sys", "n = int(sys.stdin.read().strip())", "total = 0", "for i in range(n):", "    total += i", "print(total)"].join("\n");

const TESTS: MutationTestCase[] = [
  { id: "t1", input: "5", expectedOutput: "10" }, // 0+1+2+3+4
  { id: "t2", input: "1", expectedOutput: "0" },
  { id: "t3", input: "3", expectedOutput: "3" } // 0+1+2
];

describe("mutation operator catalog", () => {
  it("proposes at least one applicable mutation for representative code", () => {
    expect(proposeMutations(REFERENCE_CODE, "python").length).toBeGreaterThan(0);
  });

  it("proposes nothing for code that matches none of the targeted patterns", () => {
    expect(proposeMutations("print('constant output')", "python")).toHaveLength(0);
  });

  it("only proposes python-specific operators (range shrink) for python, not javascript", () => {
    const pyOnly = proposeMutations("for i in range(n):\n    pass", "python");
    expect(pyOnly.some((c) => c.operatorId === "wrong_loop_boundary_range_shrink")).toBe(true);
    const jsCandidates = proposeMutations("for (let i = 0; i < n; i++) {}", "javascript");
    expect(jsCandidates.some((c) => c.operatorId === "wrong_loop_boundary_range_shrink")).toBe(false);
  });
});

describe("mutation validation pipeline (real sandbox execution)", () => {
  it("verifies a genuinely bug-introducing mutation end to end", async () => {
    const result = await generateVerifiedMutation(executor, "python", REFERENCE_CODE, TESTS);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.originalPassedAllTests).toBe(true);
    expect(result!.mutantFailedIntendedTest).toBe(true);
    expect(result!.reproducible).toBe(true);
    expect(result!.mutantFailureClass).not.toBeNull();
  }, 30_000);

  it("rejects a mutation when the 'original' reference code doesn't even pass its own tests", async () => {
    const brokenReference = REFERENCE_CODE.replace("total += i", "total = i");
    const candidates = proposeMutations(brokenReference, "python");
    expect(candidates.length).toBeGreaterThan(0);
    const result = await validateMutation(executor, "python", candidates[0]!, TESTS);
    expect(result.originalPassedAllTests).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("did not pass all provided tests"))).toBe(true);
  }, 15_000);

  it("never publishes an unverified mutation: returns null when no operator produces a failing mutant", async () => {
    const trivialCode = "print('constant output')";
    const result = await generateVerifiedMutation(executor, "python", trivialCode, [{ id: "t", input: "", expectedOutput: "constant output" }]);
    expect(result).toBeNull();
  });

  it("the validated mutation's failure is independently confirmed reproducible", async () => {
    const result = await generateVerifiedMutation(executor, "python", REFERENCE_CODE, TESTS);
    expect(result!.reproducible).toBe(true);
  }, 15_000);
});
