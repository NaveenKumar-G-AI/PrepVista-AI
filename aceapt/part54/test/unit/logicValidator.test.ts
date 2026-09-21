import { describe, it, expect } from "vitest";
import { LogicValidator } from "../../src/validators/LogicValidator.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import { upstreamThroughAnswer, withValidator } from "../fixtures/runChain.js";
import type { LogicPuzzleSpec } from "../../src/contracts/types.js";

const uniquePuzzle: LogicPuzzleSpec = {
  entities: ["Alice", "Bob", "Carol"],
  attributes: { pet: ["cat", "dog", "fish"] },
  constraints: [
    { type: "ALL_DIFFERENT", attribute: "pet" },
    { type: "NOT_EQUALS", entity: "Alice", attribute: "pet", value: "cat" },
    { type: "EQUALS", entity: "Bob", attribute: "pet", value: "dog" }
  ],
  query: { entity: "Alice", attribute: "pet" } // forced to "fish"
};

function puzzleSnapshot(overrides: Partial<ReturnType<typeof baselineSnapshot>> = {}, answer = "fish") {
  return baselineSnapshot({
    questionText: "Alice, Bob, and Carol each have a different pet (cat/dog/fish). Alice doesn't have a cat. Bob has a dog. What pet does Alice have?",
    answerType: "TEXT",
    answer,
    options: undefined,
    solution: undefined,
    derivation: { domain: "ALGEBRA", csp: uniquePuzzle }, // domain field unused by LogicValidator; csp presence drives applicability
    ...overrides
  });
}

describe("LogicValidator", () => {
  const validator = new LogicValidator();

  it("PASSes when the puzzle has a unique solution matching the declared answer", async () => {
    const snapshot = puzzleSnapshot({}, "fish");
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
    expect(result.evidence.derivedAnswer).toBe("fish");
  });

  it("FAILs with LOGIC_INVALID when the unique solution disagrees with the declared answer", async () => {
    const snapshot = puzzleSnapshot({}, "cat"); // puzzle forces "fish", author declared "cat"
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LOGIC_INVALID");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs with CONSTRAINT_CONFLICT on a direct EQUALS/NOT_EQUALS contradiction (spec §49)", async () => {
    const contradictory: LogicPuzzleSpec = {
      entities: ["Alice"],
      attributes: { pet: ["cat", "dog"] },
      constraints: [
        { type: "EQUALS", entity: "Alice", attribute: "pet", value: "cat" },
        { type: "NOT_EQUALS", entity: "Alice", attribute: "pet", value: "cat" }
      ],
      query: { entity: "Alice", attribute: "pet" }
    };
    const snapshot = puzzleSnapshot({ derivation: { domain: "ALGEBRA", csp: contradictory } });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("CONSTRAINT_CONFLICT");
  });

  it("FAILs with LOGIC_NO_SOLUTION when constraints combine to zero valid assignments (spec §48)", async () => {
    const impossible: LogicPuzzleSpec = {
      entities: ["A", "B"],
      attributes: { color: ["red", "blue"] },
      constraints: [
        { type: "ALL_DIFFERENT", attribute: "color" },
        { type: "EQUALS", entity: "A", attribute: "color", value: "red" },
        { type: "EQUALS", entity: "B", attribute: "color", value: "red" }
      ],
      query: { entity: "A", attribute: "color" }
    };
    const snapshot = puzzleSnapshot({ derivation: { domain: "ALGEBRA", csp: impossible } });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LOGIC_NO_SOLUTION");
  });

  it("FAILs with LOGIC_MULTIPLE_SOLUTIONS when more than one assignment satisfies every constraint (spec §48)", async () => {
    const underConstrained: LogicPuzzleSpec = {
      entities: ["A", "B"],
      attributes: { color: ["red", "blue"] },
      constraints: [{ type: "ALL_DIFFERENT", attribute: "color" }],
      query: { entity: "A", attribute: "color" }
    };
    const snapshot = puzzleSnapshot({ derivation: { domain: "ALGEBRA", csp: underConstrained } });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("LOGIC_MULTIPLE_SOLUTIONS");
  });

  it("is NOT_APPLICABLE when the question has no CSP spec", () => {
    const snapshot = baselineSnapshot();
    expect(validator.isApplicable({ questionVersion: snapshot } as never)).toBe(false);
  });
});
