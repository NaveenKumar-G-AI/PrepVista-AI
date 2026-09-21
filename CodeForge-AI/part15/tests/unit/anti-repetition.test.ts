import { describe, expect, it } from "vitest";
import { buildTargetSignature, isDuplicateHint, nextUntriedStrategy } from "@/lib/hint-ladder/anti-repetition";
import { DeliveredHintRecord } from "@/lib/hint-ladder/types";

function hint(overrides: Partial<DeliveredHintRecord>): DeliveredHintRecord {
  return {
    eventId: "e1",
    level: "TARGETED",
    hintType: "CONCEPT",
    concept: "BOUNDARY_CONDITION",
    targetSignature: "BOUNDARY_CONDITION:loop_condition",
    text: "Think about the relationship between a collection's size and its valid index range.",
    observation: "6/10 tests passed.",
    confidence: "MEDIUM",
    codeLocation: null,
    createdAt: new Date().toISOString(),
    executionSnapshotAtDelivery: null,
    studentResponse: null,
    effectiveness: "PENDING",
    source: "AI_GENERATED",
    ...overrides,
  };
}

describe("buildTargetSignature", () => {
  it("normalizes target area into a stable signature", () => {
    expect(buildTargetSignature("BOUNDARY_CONDITION", "Loop Condition")).toBe("BOUNDARY_CONDITION:loop_condition");
    expect(buildTargetSignature("BOUNDARY_CONDITION", null)).toBe("BOUNDARY_CONDITION:unscoped");
  });
});

describe("isDuplicateHint", () => {
  it("flags an exact concept+target+level+type repeat", () => {
    const history = [hint({})];
    const isDup = isDuplicateHint(history, {
      targetSignature: "BOUNDARY_CONDITION:loop_condition",
      level: "TARGETED",
      hintType: "CONCEPT",
    });
    expect(isDup).toBe(true);
  });

  it("does not flag a different hint type at the same level/target as a duplicate", () => {
    const history = [hint({})];
    const isDup = isDuplicateHint(history, {
      targetSignature: "BOUNDARY_CONDITION:loop_condition",
      level: "TARGETED",
      hintType: "QUESTION",
    });
    expect(isDup).toBe(false);
  });
});

describe("nextUntriedStrategy", () => {
  it("walks the failed-hint chain in order", () => {
    const history = [hint({ hintType: "CONCEPT" })];
    const next = nextUntriedStrategy(history, "BOUNDARY_CONDITION:loop_condition", "TARGETED");
    expect(next).toBe("QUESTION"); // CONCEPT was tried, QUESTION is next in the chain
  });

  it("skips strategies already tried, in chain order", () => {
    const history = [hint({ hintType: "CONCEPT" }), hint({ hintType: "QUESTION" })];
    const next = nextUntriedStrategy(history, "BOUNDARY_CONDITION:loop_condition", "TARGETED");
    expect(next).toBe("EXAMPLE");
  });

  it("returns null once every strategy in the chain has been tried at this level", () => {
    const history = ["CONCEPT", "QUESTION", "EXAMPLE", "CODE_LOCATION", "EXPLANATION"].map((t) =>
      hint({ hintType: t as DeliveredHintRecord["hintType"] })
    );
    const next = nextUntriedStrategy(history, "BOUNDARY_CONDITION:loop_condition", "TARGETED");
    expect(next).toBeNull();
  });

  it("does not consider strategies tried at a DIFFERENT level as already tried", () => {
    const history = [hint({ hintType: "CONCEPT", level: "CONCEPT" })];
    const next = nextUntriedStrategy(history, "BOUNDARY_CONDITION:loop_condition", "TARGETED");
    expect(next).toBe("CONCEPT"); // untried at TARGETED level specifically
  });

  it("does not consider strategies tried on a DIFFERENT target as already tried", () => {
    const history = [hint({ hintType: "CONCEPT", targetSignature: "OFF_BY_ONE:end_index" })];
    const next = nextUntriedStrategy(history, "BOUNDARY_CONDITION:loop_condition", "TARGETED");
    expect(next).toBe("CONCEPT");
  });
});
