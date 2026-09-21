import { describe, it, expect } from "vitest";
import { buildClaimGraph, propagateContradictions } from "../src/engine/claimGraph";

describe("claim graph contradiction propagation", () => {
  it("propagates a contradiction to claims connected via reliance-type relationships", () => {
    // A <--CONTRADICTS-- B <--DEPENDS_ON-- C ; D is unrelated
    const graph = buildClaimGraph(
      [
        { id: "A", text: "I maintain a valid sliding window." },
        { id: "B", text: "The left pointer moves whenever the constraint is violated." },
        { id: "C", text: "This guarantees the window becomes valid again." },
        { id: "D", text: "Totally unrelated claim." },
      ],
      [
        { fromClaimId: "B", toClaimId: "A", type: "CONTRADICTS", confidence: 0.9 },
        { fromClaimId: "C", toClaimId: "B", type: "DEPENDS_ON", confidence: 0.8 },
      ],
    );

    const affected = propagateContradictions(graph);

    expect(affected.get("A")?.affected).toBe(true);
    expect(affected.get("B")?.affected).toBe(true);
    expect(affected.get("C")?.affected).toBe(true); // C depends on B, which is contradicted
    expect(affected.has("D")).toBe(false); // D is unrelated and must not be flagged
  });

  it("does not flag anything when there are no contradictions", () => {
    const graph = buildClaimGraph(
      [{ id: "A", text: "claim A" }, { id: "B", text: "claim B" }],
      [{ fromClaimId: "A", toClaimId: "B", type: "SUPPORTS", confidence: 0.7 }],
    );
    const affected = propagateContradictions(graph);
    expect(affected.size).toBe(0);
  });
});
